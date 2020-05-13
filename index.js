// Accessory for controlling BenQ Projectors via HomeKit.

var Service, Characteristic;
const serialio = require('serial-io');
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
        this.baudrate = config['baudrate'] || 115200;
        // this.timeout = config.timeout || 1000;
        this.queue = [];
        // this.callbackQueue = [];
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
            "Power On": "\r*pow=on#\r",
            "Power Off": "\r*pow=off#\r",
            "Power State": "\r*pow=?#\r",
            "Mute On": "\r*mute=on#\r",
            "Mute Off": "\r*mute=off#\r",
            "Mute State": "\r*mute=?#\r",
            "Volume Up": "\r*vol=+#\r",
            "Volume Down": "\r*vol=-#\r",
            "Volume State": "\r*vol=?#\r",
            "Source Set": "\r*sour=\r",
            "Source Get": "\r*sour=?#\r"
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
        
        // Start polling
        this.refreshProjectorStatus();
    }


    /////////////////////////////
    // Serial Command Function //
    /////////////////////////////
    sendCommand(command) {
      this.log.debug("sendCommand: " + command.replace(/[\\$'"]/g, "\\$&"));
      // return new Promise((resolve, reject) => {
      //   serialport.list((err, ports) => {
      //     if (err) {
      //       reject(new Error(err))
      //     } else {
      //       resolve(ports)
      //     }
      //   })
      // })
      return new Promise(function(resolve, reject){
          serialio.send(this.adapter, command, {baudRate:this.baudrate}).then(response => {
          this.log.debug(`Response came back: ${response}`)
          // Error handling
          if (response.indexOf("Block") > -1) {
            this.log.warn("Block in response.")
            reject();
          } 
          if (response === undefined) {
            this.log.error("Response was undefined.")
            reject();
          }
          // Response handling
          if (response.indexOf("*pow=") > -1) {
            this.handlePowResponse(response);
            resolve();
          }
          if (response.indexOf("*sour=") > -1) {
            this.handleSourResponse(response);
            resolve();
          }
          if (response.indexOf("*mute=") > -1) {
            this.handleMuteResponse(response);
            resolve();
          }
          if (response.indexOf("*vol=") > -1) {
            this.handleVolResponse(response);
            resolve();
          }
        }).catch(error => {
          this.log.error(`Sending command encountered error: ${error}`)
          reject();
        });
      })
        
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

    refreshProjectorStatus() {
        this.log.debug('Refresh projector status');
    
        try {
          this.log.debug('Refreshing power state.');
          this.getPowerState();
          this.log.debug('Power state refreshed.');
          if (this.state) {
            this.log.debug('Refreshing input source.');
            this.getInputSource();
            this.log.debug('Input source refreshed.');
          }
        }
        catch (e) {
          this.log.error(`Failed to refresh projector status: ${e}`);
        }
    
        // Schedule another update
        setTimeout(() => {
          this.refreshProjectorStatus();
        }, this.pollingInterval);
    }

    getPowerState(callback) {
        this.log.debug('Getting power state.');
        if (callback) {
          callback(null, this.state);
        }
        serialio.send(this.adapter, this.commands['Power State'], {baudRate:this.baudrate}).then(response => {
          this.handlePowResponse(response);
        }).catch(error => {
          this.log.error(`Failed to get power state: ${error}`)
        });
    }
        
    setPowerState(value, callback) {
        this.log.debug(`Set projector power state to ${value}`);
        if (callback) {
          callback(null, this.state);
        }
        this.state = value;
        if (value) {
          var cmd = this.commands['Power On'];
          this.log.info("Power On");
        } else {
          var cmd = this.commands['Power Off'];
          this.log.info("Power Off");
        }
        
        serialio.send(this.adapter, cmd, {baudRate:this.baudrate}).then(response => {
          this.handlePowResponse(response);
        }).catch (e => {
        this.log.error(`Failed to set power state ${e}`);
      })
    }
        
    getMuteState(callback) {
          this.log.debug('Getting mute state.');
          if (callback) {
            callback(null, this.mute);
          }
          serialio.send(this.adapter, this.commands['Mute State'], {baudRate:this.baudrate}).then(response => {
            this.handleMuteResponse(response);
          }).catch (e => {
          this.log.error(`Failed to get mute state: ${e}`);
      })
    }
        
    setMuteState(value, callback) {
        this.log.debug(`Set projector mute state to ${value}`);
        this.mute = value;
        if (callback) {
          callback(null, this.mute);
        }
          if (value) {
            var cmd = this.commands['Mute On'];
            this.log.info("Mute On")
          } else {
            var cmd = this.commands['Mute Off'];
            this.log.info("Mute Off");
          }
          serialio.send(this.adapter, cmd, {baudRate:this.baudrate}).then(response => {
          this.handleMuteResponse(response);
          }).catch (e => {
          this.log.error(`Failed to set mute state ${e}`);
        })
    }
        
    getVolume(callback) {
            this.log.debug('Getting volume state.')
            if (callback) {
              callback(null, this.volume);
            }
            serialio.send(this.adapter, this.commands['Volume State'], {baudRate:this.baudrate}).then(response => {
              this.handleVolResponse(response);
            }).catch (e => {
            this.log.error(`Failed to get volume state: ${e}`);
        })
    }

    setVolumeState(value, callback) {
      if (callback) {
        callback(null, this.volume);
      }
        this.getVolume().then(function(){
          var volDiff = this.volume - value;
          this.log.info("Setting volume to %s", value);
          if (volDiff < 0) {
              while (volDiff < 0)
              this.setVolumeRelative(Characteristic.VolumeSelector.INCREMENT)
          } else if (volDiff > 0) {
              while (volDiff > 0)
              this.setVolumeRelative(Characteristic.VolumeSelector.DECREMENT)
          }
        })
        
    }

    setVolumeRelative(volumeDirection, callback) {
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
      
      serialio.send(this.adapter, cmd, {baudRate:this.baudrate}).then(response => {
        this.handleVolResponse(response);
      }).catch(e => {
        this.log.error(`Failed to set volume: ${e}`)
      });
    }

    getInputSource(callback) {
      if (callback) {
        callback(null, this.lastKnownSource);
      }
        this.log.debug("Getting source")
          serialio.send(this.adapter, this.commands['Source Get'], {baudRate:this.baudrate}).then(response => {
            this.handleSourResponse(response);
          }).catch (e => {
          this.log.error(`Failed to refresh Input state: ${this.commands['Source Get']} => ${e}`);
        })
    }

    setInputSource(source, callback) {
        this.log.debug(`Set projector Input to ${source}`);
        if (callback) {
          callback();
        }
        var cmd = this.commands['Source Set'];
        var input = this.inputs[source];
        this.log.info("Setting input to %s", input['label']);
        cmd = cmd + input['input'] + "#";
          this.log.debug(`Sending setInputSource ${cmd}`);
          serialio.send(this.adapter, cmd, {baudRate:this.baudrate}).then(response => {
            this.handleSourResponse(response);
          }).catch (e => {
          this.log.error(`Failed to set characteristic ${e}`);
        })
    }
        
    identify(callback) {
        this.log.info("Identify requested!");
        
        this.setPowerState(true); // turn on
    }

    remoteKeyPress(button, callback) {
      if(callback) callback();
      this.log.debug(button)
      if (this.buttons[button]) {
        var press = this.buttons[button]
        this.log.info("Pressing remote key %s", button);
          serialio.send(this.adapter, press, {baudRate:this.baudrate}).then().catch (e => {
          this.log.error(`Failed to press remote key: ${e}`);
        })
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
        
        this.enabledServices.push(this.tvService);
        this.prepareTvSpeakerService();
        this.addSources(this.tvService);
        return this.enabledServices;
    }
};
