// Accessory for controlling BenQ Projectors via HomeKit.

const serialio = require('serial-io');
const version = require('./package.json').version;
const { createAccessory } = require('./accessoryCreator');
let Service, Characteristic, Categories;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Categories = homebridge.hap.Categories;

    homebridge.registerPlatform("homebridge-benq-projector", "BenQ-Projector", BenQProjectorPlatform);
}

class BenQProjectorPlatform {
    constructor (log, config = {}, homebridge) {
        this.log = log;
        this.config = config;
        this.homebridge = homebridge;
    }

    accessories (callback) {
        const { config, log, homebridge } = this;
        if (!config) {
            log.warn('No config found. Please take a look at the README and example-config.json file of homebridge-benq-projector!');
            callback([]);
            return;
        }

        if (!config.devices || !(config.devices instanceof Array)) {
            log.warn('Malformed configuration found. Please take a look at the README and example-config.json file of homebridge-benq-projector!');
            callback([]);
            return;
        }

        const tvs = config.devices.map(device => new BenQProjector(log, device));
        homebridge.publishExternalAccessories('homebridge-benq-projector', tvs.map(tv => createAccessory(tv, tv.name, Categories.TELEVISION, homebridge)));

        callback([]);
    }
}

class BenQProjector {
    // Configuration
    constructor(log, config) {
        this.name = config['name'];
        this.model = config['model'] || "-";
        this.adapter = config['adapter'];
        this.baudrate = config['baudrate'] || 115200;
        this.pollingInterval = config.pollingInterval || 6000;
        this.lastKnownSource = 0;
        this.state = false;
        this.mute = false;
        this.volume = 0;
        this.pictureMode = Characteristic.PictureMode.OTHER;

        this._log = log;

        this.enabledServices = [];

        this.commands = {
            "Power On": "\r*pow=on#\r",
            "Power Off": "\r*pow=off#\r",
            "Power State": "\r*pow=?#\r",
            "Mute On": "\r*mute=on#\r",
            "Mute Off": "\r*mute=off#\r",
            "Mute State": "\r*mute=?#\r",
            "Volume Up": "\r*vol=+#\r",
            "Volume Down": "\r*vol=-#\r",
            "Volume State": "\r*vol=?#\r",
            // This purposefully doesn't end in \r as it's added later when this command is used.
            "Source Set": "\r*sour=",
            "Source Get": "\r*sour=?#\r",
            // This purposefully doesn't end in \r as it's added later when this command is used.
            "Picture Mode Set": "\r*appmod=",
            "Picture Mode Get": "\r*appmod=?#\r"
        };

        this.buttons = {
        [Characteristic.RemoteKey.ARROW_UP]: "\r*up#\r",
        [Characteristic.RemoteKey.ARROW_DOWN]: "\r*down#\r",
        [Characteristic.RemoteKey.ARROW_LEFT]: "\r*left#\r",
        [Characteristic.RemoteKey.ARROW_RIGHT]: "\r*right#\r",
        [Characteristic.RemoteKey.SELECT]: "\r*enter#\r",
        [Characteristic.RemoteKey.BACK]: "\r*menu=off#\r",
        [Characteristic.RemoteKey.EXIT]: "\r*menu=on#\r",
        [Characteristic.RemoteKey.INFORMATION]: "\r*menu=on#\r",
        };

        this.inputs = config['inputs'] || [
        {"input": "hdmi", "label": "HDMI 1"},
        {"input": "RGB", "label": "COMPUTER/YPbPr"},
        {"input": "ypbr", "label": "Component"},
        {"input": "hdmi2", "label": "HDMI 2"},
        {"input": "vid", "label": "Composite"},
        {"input": "svid", "label": "S-Video"}
        ];

        // Other possible inputs but not supported by W0170
        // {"input": "RGB2", "label": "COMPUTER 2/YPbPr2"},
        // {"input": "dviA", "label": "DVI-A"},
        // {"input": "dvid", "label": "DVI-D"},
        // {"input": "network", "label": "Network"},
        // {"input": "usbdisplay", "label": "USB Display"},
        // {"input": "usbreader", "label": "USB Reader"}

        this.pictureModes = config['picturemodes'] || {
          [Characteristic.PictureMode.OTHER]: "user1",
          [Characteristic.PictureMode.STANDARD]:	"std",
          [Characteristic.PictureMode.CALIBRATED]: "cine",
          [Characteristic.PictureMode.CALIBRATED_DARK]: "isfnight",
          [Characteristic.PictureMode.VIVID]: "bright",
          [Characteristic.PictureMode.GAME]: "game",
          [Characteristic.PictureMode.COMPUTER]: "preset",
          [Characteristic.PictureMode.CUSTOM]: "user2"
        };

        // Serial command queue
        this.queue = [];

        // Start polling
        setInterval(() => {
            this.refreshProjectorStatus();
        }, this.pollingInterval);
        setInterval(async() => {
            await this.sendCommands();
        }, 500);
    }

    log(level, line) {
        if (level === "info") {
            this._log.info(JSON.stringify(line));
        }
        if (level === "error") {
            this._log.error(JSON.stringify(line));
        }
        if (level === "warn") {
            this._log.warn(JSON.stringify(line));
        }
        if (level === "debug") {
            this._log.debug(JSON.stringify(line));
        }
    }

    /////////////////////////////
    // Serial Command Function //
    /////////////////////////////
     async sendCommands() {
        // If the queue gets too big, reduce it by deduplicating it.
        if (this.queue.length > 5) {
            this.queue = [...new Set(this.queue)]
        }
        var index, cmd;

        for (index in this.queue) {
            cmd = this.queue[index];
            this.log("debug", `sendCommand: ${cmd}`);
            var response = await serialio.send(this.adapter, cmd, {baudRate:this.baudrate}).catch(error => {
                    // Don't remove command that failed so it can be run again.
                    this.log("debug", `Sending command ${cmd} encountered error: ${error}`)
                });
            if (response != null) {
                this.log("debug", `Response came back: ${response} for command: ${cmd}`)
                // Error handling
                if (response.indexOf("Block") > -1) {
                    this.log("debug", "Block in response.")
                }
                // Response handling
                if (response.indexOf("*pow=") > -1) {
                    this.handlePowResponse(response);
                }
                if (response.indexOf("*sour=") > -1) {
                    this.handleSourResponse(response);
                }
                if (response.indexOf("*mute=") > -1) {
                    this.handleMuteResponse(response);
                }
                if (response.indexOf("*vol=") > -1) {
                    this.handleVolResponse(response);
                }
                if (response.indexOf("*appmod=") > -1) {
                    this.handleAppmodResponse(response);
                }
                // Remove command that was successfully run.
                this.queue.splice(index, 1);
            } else {
                this.log("debug", "Response was undefined")
            }
        }
    }

    async handlePowResponse(response) {
        if (response.indexOf("ON") > -1) {
            this.log("debug", 'Power is On');
            this.state = true;
        }
        if (response.indexOf("OFF") > -1) {
            this.log("debug", 'Power is Off');
            this.state = false;
        }

        this.tvService
            .getCharacteristic(Characteristic.Active)
            .updateValue(this.state);
    }

    async handleSourResponse(response) {
        this.log("debug", `getInput response: ${response}`);
        this.inputs.forEach((i, x) => {
            if (response.toLowerCase().indexOf(i.input.toLowerCase() + "#") > -1) {
                this.lastKnownSource = x;
                this.log("debug", `Input is ${i.input}`);
            }
        })
        this.log("debug", `Setting ActiveIdentifier to: ${this.lastKnownSource}`);
        this.tvService
            .getCharacteristic(Characteristic.ActiveIdentifier)
            .updateValue(this.lastKnownSource);
    }

    async handleAppmodResponse(response) {
        this.log("debug", `getPictureMode response: ${response}`);
        Object.entries(this.pictureModes).forEach(([x, mode]) => {
          if (response.toLowerCase().indexOf(mode.toLowerCase() + "#") > -1) {
                  this.pictureMode = x;
                  this.log("debug", `Picture Mode is ${mode}`);
              }
          });
          this.log("debug", `Setting PictureMode to: ${this.pictureMode}`);
          this.tvService
              .getCharacteristic(Characteristic.PictureMode)
              .updateValue(this.pictureMode);


    }

    async handleMuteResponse(response) {
        if (response.indexOf("ON") > -1) {
            this.log("debug", 'Mute is On');
            this.mute = true;
        }
        if (response.indexOf("OFF") > -1) {
            this.log("debug", 'Mute is Off');
            this.mute = false;
        }
        this.tvSpeakerService
            .getCharacteristic(Characteristic.Mute)
            .updateValue(this.mute);
    }

    async handleVolResponse(response) {
        if (response.indexOf("*VOL=") > -1) {
            var vol = Number(response.split('=')[1].split('#'));
            this.log("debug", `Volume is: ${vol}`)
            if (vol) {
                this.volume = vol;
            }
            if (vol) {
                this.tvSpeakerService
                    .getCharacteristic(Characteristic.Volume)
                    .updateValue(this.volume);
            }
        }

        this.log("debug", `Volume is: ${this.volume}`)
    }


    ///////////////////////////
    // Functions for HomeKit //
    ///////////////////////////

    refreshProjectorStatus() {
        this.log("debug", 'Refresh projector status');

        try {
            this.log("debug", 'Refreshing power state.');
            this.getPowerState();
            this.log("debug", 'Power state refreshed.');
            if (this.state) {
                this.log("debug", 'Refreshing input source.');
                this.getInputSource();
                this.log("debug", 'Input source refreshed.');
            }
        }
        catch (e) {
            this.log("error", `Failed to refresh projector status: ${e}`);
        }
    }

    getPowerState(callback) {
        this.log("debug", 'Getting power state.');
        this.queue.push(this.commands['Power State']);
        if (callback) {
            callback(null, this.state);
        }
    }

    setPowerState(value, callback) {
        this.log("debug", `Set projector power state to ${value}`);
        this.state = value;
        if (value) {
          var cmd = this.commands['Power On'];
          this.log("info", "Power On");
        } else {
          var cmd = this.commands['Power Off'];
          this.log("info", "Power Off");
        }

        this.queue.push(cmd);
        if (callback) {
          callback(null, this.state);
        }
    }

    getMuteState(callback) {
        this.log("debug", 'Getting mute state.');
        this.queue.push(this.commands['Mute State']);
        if (callback) {
          callback(null, this.mute);
        }
    }

    setMuteState(value, callback) {
        this.log("debug", `Set projector mute state to ${value}`);
        this.mute = value;
        if (value) {
          var cmd = this.commands['Mute On'];
          this.log("info", "Mute On")
        } else {
          var cmd = this.commands['Mute Off'];
          this.log("info", "Mute Off");
        }
        this.queue.push(cmd);
        if (callback) {
          callback(null, this.mute);
        }
    }

    getVolume(callback) {
        this.log("debug", 'Getting volume state.')
        this.queue.push(this.commands['Volume State'], {baudRate:this.baudrate})
        if (callback) {
          callback(null, this.volume);
        }
    }

    getVolume(callback) {
        this.log("debug", 'Getting volume state.')
        this.queue.push(this.commands['Volume State']);
        if (callback) {
            callback(null, this.volume);
        }
    }

    setVolumeState(value, callback) {
        this.getVolume().then(function () {
            var volDiff = this.volume - value;
            this.log("info", `Setting volume to ${value}`);
            if (volDiff < 0) {
                while (volDiff < 0)
                this.setVolumeRelative(Characteristic.VolumeSelector.INCREMENT)
            } else if (volDiff > 0) {
                while (volDiff > 0)
                this.setVolumeRelative(Characteristic.VolumeSelector.DECREMENT)
            }
        })
        if (callback) {
            callback(null, this.volume);
        }
    }

    setVolumeRelative(volumeDirection, callback) {
        // Change volume by pressing Volume Up or Volume Down
        if (volumeDirection === Characteristic.VolumeSelector.INCREMENT) {
            var cmd = this.commands['Volume Up'];
            this.log("info", "Volume Up")
        } else if (volumeDirection === Characteristic.VolumeSelector.DECREMENT) {
            var cmd = this.commands['Volume Down'];
            this.log("info", "Volume Down")
        } else {
            that.log.error( "setVolumeRelative - VOLUME : ERROR - unknown direction sent");
        }

        this.queue.push(cmd);
        if (callback) {
            callback();
        }
    }

    getInputSource(callback) {
        if (this.state) {
            this.log("debug", "Getting source")
            this.queue.push(this.commands['Source Get']);
        }
        if (callback) {
            callback(null, this.lastKnownSource);
        }
    }

    setInputSource(source, callback) {
        this.log("debug", `Set projector Input to ${source}`);
        var cmd = this.commands['Source Set'];
        var input = this.inputs[source];
        this.log("info", `Setting input to ${input['label']}`);
        cmd = cmd + input['input'] + "#\r";
        this.log("debug", `Sending setInputSource ${cmd}`);
        this.queue.push(cmd)
        if (callback) {
            callback();
        }
    }

    getPictureMode(callback) {
        if (this.state) {
            this.log("debug", "Getting picture mode")
            this.queue.push(this.commands['Picture Mode Get']);
        }
        if (callback) {
            callback(null, this.pictureMode);
        }
    }

    setPictureMode(mode, callback) {
        this.log("info", `Set projector Picture Mode to ${mode}`);
        var cmd = this.commands['Picture Mode Set'] + this.pictureModes[mode] + "#\r";
        this.log("debug", `Sending setPictureMode ${cmd}`);
        this.queue.push(cmd)
        if (callback) {
            callback(null, this.pictureMode);
        }
    }

    remoteKeyPress(button, callback) {
        this.log("debug", button)
        if (this.buttons[button]) {
            var press = this.buttons[button]
            this.log("info", `Pressing remote key ${button}`);
            this.queue.push(press);
        } else {
            this.log("error", `Remote button ${button} not supported.`)
            return
        }
        if(callback) callback();
    }

    identify(callback) {
        this.log("info", "Identify requested!");
        this.setPowerState(true);
        if (callback) {
            callback();
        } // turn on
    }

    addSources(service) {
        this.log("debug", this.inputs)
        this.inputs.forEach((i, x) => {
            var inputName = i['label']
            this.log("debug", inputName)
            let tmpInput = new Service.InputSource(inputName, 'inputSource' + x);
            tmpInput
                .setCharacteristic(Characteristic.Identifier, x)
                .setCharacteristic(Characteristic.ConfiguredName, inputName)
                .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI)
                .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

            service.addLinkedService(tmpInput);
            this.enabledServices.push(tmpInput);
        })
    }

    prepareTvSpeakerService() {
        this.tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService');
        this.tvSpeakerService
            .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
            .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
        this.tvSpeakerService
            .getCharacteristic(Characteristic.VolumeSelector)
            .on('set', this.setVolumeRelative.bind(this));
        this.tvSpeakerService
            .getCharacteristic(Characteristic.Mute)
            .on('get', this.getMuteState.bind(this))
            .on('set', this.setMuteState.bind(this));
        this.tvSpeakerService
            .addCharacteristic(Characteristic.Volume)
            .on('get', this.getVolume.bind(this))
            .on('set', this.setVolumeState.bind(this));

        this.tvService.addLinkedService(this.tvSpeakerService);
        this.enabledServices.push(this.tvSpeakerService);
    }

    getServices() {
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, "BenQ")
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.adapter)
            .setCharacteristic(Characteristic.FirmwareRevision, version);

        this.enabledServices.push(informationService);

        this.tvService = new Service.Television(this.name);

        this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name)
        this.tvService.getCharacteristic(Characteristic.ConfiguredName).setProps({
            perms: [Characteristic.Perms.READ]
        });

        this.tvService
            .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        this.tvService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));

        this.tvService
            .getCharacteristic(Characteristic.ActiveIdentifier)
            .on('set', this.setInputSource.bind(this))
            .on('get', this.getInputSource.bind(this));

        this.tvService
            .getCharacteristic(Characteristic.RemoteKey)
            .on('set', this.remoteKeyPress.bind(this));

        this.tvService
            .getCharacteristic(Characteristic.PowerModeSelection)
            .on('set', (newValue, callback) => {
                this.remoteKeyPress(Characteristic.RemoteKey.INFORMATION, callback);
            });

        this.tvService
            .addCharacteristic(Characteristic.PictureMode)
            .on('set', this.setPictureMode.bind(this))
            .on('get', this.getPictureMode.bind(this));

        this.enabledServices.push(this.tvService);
        this.prepareTvSpeakerService();
        this.addSources(this.tvService);
        return this.enabledServices;
    }
};
