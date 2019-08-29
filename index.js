// Accessory for controlling BenQ Projectors via HomeKit.
// Adapted from https://github.com/rooi/homebridge-marantz-rs232
// and https://github.com/grover/homebridge-epson-projector-rs232

// var SerialPort = require("serialport");
var Service, Characteristic;
const Transport = require('./Transport');
var version = require('./package.json').version;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    
    homebridge.registerAccessory("homebridge-benq-projector", "BenQ-Projector", BenQProjector);
}
    
    
class BenQProjector {
    // Configuration
    constructor(log, config) {
        this.name = config['name'];
        this.model = config['model'] || "-";
        this.adapter = config['adapter'];
        
        // this.timeout = config.timeout || 1000;
        this.queue = [];
        this.callbackQueue = [];
        this.ready = true;
        this.pollingInterval = config.pollingInterval || 6000;
        this.lastKnownSource = 0;
        this.state = false;
        this.mute = false;
        this.volume = 0;
        
        this._isReachable = false;
        this.log = log;

        this.enabledServices = [];

        this.commands = {
            "Power On": "\r*pow=on#",
            "Power Off": "\r*pow=off#",
            "Power State": "\r*pow=?#",
            "Mute On": "\r*mute=on#",
            "Mute Off": "\r*mute=off#",
            "Mute State": "\r*mute=?#",
            "Volume Up": "\r*vol=+#",
            "Volume Down": "\r*vol=-#",
            "Volume State": "\r*vol=?#",
            "Source Set": "\r*sour=",
            "Source Get": "\r*sour=?#"
        };

        this.buttons = {
        [Characteristic.RemoteKey.ARROW_UP]: "\r*up#",
        [Characteristic.RemoteKey.ARROW_DOWN]: "\r*down#",
        [Characteristic.RemoteKey.ARROW_LEFT]: "\r*left#",
        [Characteristic.RemoteKey.ARROW_RIGHT]: "\r*right#",
        [Characteristic.RemoteKey.SELECT]: "\r*enter#",
        [Characteristic.RemoteKey.BACK]: "\r*menu=off#",
        [Characteristic.RemoteKey.EXIT]: "\r*menu=on#",
        [Characteristic.RemoteKey.INFORMATION]: "\r*menu=on#",
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
        
        /////////////////////////////
        // Setup Serial Connection //
        /////////////////////////////
        this.serialPort = new Transport(this.adapter, this.log);
        this.serialPort.on('connected', this._onConnected.bind(this));
        this.serialPort.on('disconnected', this._onDisconnected.bind(this));
  
    }


    //////////////////////////////
    // Serial Command Functions //
    //////////////////////////////

    async _onConnected() {
        this.log.debug('Connected. Refreshing characteristics.');
        await this._refreshProjectorStatus();
        this._setReachable(true);
    }

    _onDisconnected() {
        this.log.debug('Disconnected');
        this._setReachable(false);
    }

    _setReachable(state) {
      this.log.debug(`Reachable: ${state}`);
      if (this._isReachable === state) {
        return;
      }
  
      this._isReachable = state;
  
      this._bridgingService.getCharacteristic(Characteristic.Reachable)
        .updateValue(this._isReachable);
    }

    async _sendCommand(cmd) {
        this.log.debug("_sendCommand: %s", cmd)
        const response = await this.serialPort.execute(cmd);

        // Error handling
        if (response.indexOf("Block") > -1) {
            this.log.warn("Block in response.")
        } 
        // if (response === ">") {
        //     this.log.debug("Ready response returned. Retrying.")
        //     setTimeout(() => {
        //         this._sendCommand(cmd);
        //       }, this.pollingInterval);
        // } 
        if (response === undefined) {
            this.log.error("Response was undefined.")
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

    }

    handlePowResponse(response) {
        if (response.indexOf("ON") > -1) {
            this.log.debug('Power is On');
            this.state = true;
        }
        if (response.indexOf("OFF") > -1) {
            this.log.debug('Power is Off');
            this.state = false;
        }
        
        this.tvService
            .getCharacteristic(Characteristic.Active)
            .updateValue(this.state);
    }

    handleSourResponse(response) {
        this.log.debug("getInput response:");
        this.log.debug(response);
        this.log.debug("getInput lower:");
        this.log.debug(response.toLowerCase());
        this.inputs.forEach((i, x) =>  {
          this.log.debug(i.input);
          this.log.debug(response.toLowerCase().indexOf(i.input.toLowerCase() +"#"));
            if (response.toLowerCase().indexOf(i.input.toLowerCase() +"#") > -1) {
            this.lastKnownSource = x;
            this.log.debug("Input is %s", i.input);

            }
        })
        this.log.debug("Setting ActiveIdentifier to:");
        this.log.debug(this.lastKnownSource);
        this.tvService
            .getCharacteristic(Characteristic.ActiveIdentifier)
            .updateValue(this.lastKnownSource);
    }

    handleMuteResponse(response) {
        if (response.indexOf("ON") > -1) {
            this.log.debug('Mute is On');
            this.mute = true;
        }
        if (response.indexOf("OFF") > -1) {
            this.log.debug('Mute is Off');
            this.mute = false;
        }
        this.tvSpeakerService
              .getCharacteristic(Characteristic.Mute)
              .updateValue(this.mute);
    }

    handleVolResponse(response) {
      if(response.indexOf("*VOL=") > -1) {
        var vol = Number(response.split('=')[1].split('#'));
        this.log.debug(vol)
        if (vol) {
            this.volume = vol;
        }
        if (vol) {
            this.tvSpeakerService
                .getCharacteristic(Characteristic.Volume)
                .updateValue(this.volume);
        }
      }

      this.log.debug("Volume is: %n", this.volume)
    }



    ///////////////////////////
    // Functions for HomeKit //
    ///////////////////////////

    async _refreshProjectorStatus() {
        this.log.debug('Refresh projector status');
    
        try {
            this.log.debug('Refreshing power state.');
          await this.getPowerState();
          this.log.debug('Power state refreshed.');

          if (this.state) {
            this.log.debug('Refreshing input source.');
            await this.getInputSource();
            this.log.debug('Input source refreshed.');
          }
        }
        catch (e) {
          this.log.error(`Failed to refresh projector status: ${e}`);
        }
    
        // Schedule another update
        setTimeout(() => {
          this._refreshProjectorStatus();
        }, this.pollingInterval);
    }

    getBridgingStateService() {
      this._bridgingService = new Service.BridgingState();
      this._bridgingService.getCharacteristic(Characteristic.Reachable)
        .updateValue(this._isReachable);
      this.enabledServices.push(this._bridgingService);
    }

    async getPowerState(callback) {
        try {
            this.log.debug('Getting power state.');
            await this._sendCommand(this.commands['Power State']);
        }
        catch (e) {
            this.log.error(`Failed to get power state: ${e}`);
        }
        if (callback) {
          callback(null, this.state);
        }
    }
        

    async setPowerState(value, callback) {
        
        this.log.debug(`Set projector power state to ${value}`);
        try {
          if (value) {
            var cmd = this.commands['Power On'];
            this.log.info("Power On");
          } else {
            var cmd = this.commands['Power Off'];
            this.log.info("Power Off");
          }
    
          await this._sendCommand(cmd);
          this.state = value;
          await this.getPowerState();
        }
        catch (e) {
          this.log.error(`Failed to set power state ${e}`);
        }
        if (callback) {
          callback(null, this.state);
        }
    }
        

    async getMuteState(callback) {
      try {
          this.log.debug('Getting mute state.');
          await this._sendCommand(this.commands['Mute State']);
      }
      catch (e) {
          this.log.error(`Failed to get mute state: ${e}`);
      }
      if (callback) {
        callback(null, this.mute);
      }
    }
        

    async setMuteState(value, callback) {
        this.log.debug(`Set projector mute state to ${value}`);
        try {
          if (value) {
            var cmd = this.commands['Mute On'];
            this.log.info("Mute On")
          } else {
            var cmd = this.commands['Mute Off'];
            this.log.info("Mute Off");
          }

          await this._sendCommand(cmd);
          await this.getMuteState();
          this.mute = value;
        }
        catch (e) {
          this.log.error(`Failed to set mute state ${e}`);
        }
        if (callback) {
          callback(null, this.mute);
        }
    }
        

    async getVolume(callback) {
        try {
            this.log.debug('Getting volume state.')
            await this._sendCommand(this.commands['Volume State']);
        }
        catch (e) {
            this.log.error(`Failed to get volume state: ${e}`);
        }
        if (callback) {
          callback(null, this.volume);
        }
    }


    async setVolumeState(value, callback) {
        if (callback) {
          callback(null, this.volume);
        }
        this.getVolume();
        var volDiff = this.volume - value;
        this.log.info("Setting volume to %s", value);
        if (volDiff < 0) {
            while (volDiff < 0)
            this.setVolumeRelative(Characteristic.VolumeSelector.INCREMENT)
        } else if (volDiff > 0) {
            while (volDiff > 0)
            this.setVolumeRelative(Characteristic.VolumeSelector.DECREMENT)
        }
    }

    async setVolumeRelative(volumeDirection, callback) {
        if (callback) {
          callback();
        }
        // Change volume by pressing Volume Up or Volume Down
      if (volumeDirection === Characteristic.VolumeSelector.INCREMENT) {
        var cmd = this.commands['Volume Up'];
        this.log.info("Volume Up")
      } else if (volumeDirection === Characteristic.VolumeSelector.DECREMENT) {
        var cmd = this.commands['Volume Down'];
        this.log.info("Volume Down")
      } else {
        that.log.error( "setVolumeRelative - VOLUME : ERROR - unknown direction sent");
      }
      
      await this._sendCommand(cmd)
    }

    async getInputSource(callback) {
        if (callback) {
          callback(null, this.lastKnownSource);
        }
        this.log.debug("Getting source")
        try {
          await this._sendCommand(this.commands['Source Get']);
        }
        catch (e) {
          this.log.error(`Failed to refresh Input state: ${this.commands['Source Get']} => ${e}`);
        }
    }

    async setInputSource(source, callback) {
        this.log.debug(`Set projector Input to ${source}`);
        var cmd = this.commands['Source Set'];
        var input = this.inputs[source];
        this.log.info("Setting input to %s", input['label']);
        cmd = cmd + input['input'] + "#";

        try {
          this.log.debug(`Sending setInputSource ${cmd}`);
          await this._sendCommand(cmd);
        }
        catch (e) {
          this.log.error(`Failed to set characteristic ${e}`);
        }
        if (callback) {
          callback();
        }
    }
        
    async identify(callback) {
        if(callback) callback();
        this.log.info("Identify requested!");
        
        await this.setPowerState(true); // turn on
    }

    async remoteKeyPress(button, callback) {
      this.log.debug(button)
      if (callback) {
        callback();
      }
      if (this.buttons[button]) {
        var press = this.buttons[button]
        this.log.info("Pressing remote key %s", button);
        try {
          await this._sendCommand(press);
        } catch (e) {
          this.log.error(`Failed to press remote key: ${e}`);
        }
      } else {
        this.log.error('Remote button %d not supported.', button)
        return
      }
      
    }

    addSources(service) {
      this.log.debug(this.inputs)
      this.inputs.forEach((i, x) =>  {
          var inputName = i['label']
          this.log.debug(inputName)
          let tmpInput = new Service.InputSource(inputName, 'inputSource' + x);
          tmpInput
            .setCharacteristic(Characteristic.Identifier, x)
            .setCharacteristic(Characteristic.ConfiguredName, inputName)
            .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
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

        this.tvService
          .setCharacteristic(Characteristic.ConfiguredName, this.name);
      
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
        
        this.enabledServices.push(this.tvService);
        this.prepareTvSpeakerService();
        this.addSources(this.tvService)
        this.getBridgingStateService();
        return this.enabledServices;
    }

};