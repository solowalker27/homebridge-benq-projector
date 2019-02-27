// Accessory for controlling BenQ Projectors via HomeKit.
// Adapted from https://github.com/rooi/homebridge-marantz-rs232
// and https://github.com/grover/homebridge-epson-projector-rs232

// var SerialPort = require("serialport");
var Service, Characteristic;
const Transport = require('./Transport');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    
    homebridge.registerAccessory("homebridge-benq-projector", "BenQ-Projector", BenQProjector);
}
    
    
class BenQProjector {
    // Configuration
    constructor(log, config) {
        this.name = config['name'];
        this.model = config['model'];
        this.adapter = config['adapter'];
        this.inputs = config['inputs'];
        
        this.timeout = config.timeout || 1000;
        this.queue = [];
        this.callbackQueue = [];
        // this.readBuffer = [];
        this.ready = true;
        this.pollingInterval = config.pollingInterval || 10000;
        // this.pollingInterval = this.config['pollingInterval'] || 10000;
        this.lastKnownSource = 0;
        this.state = false;
        
        this.log = log;

        this.enabledServices = [];
        // this.commands = {
        //     "Power On": "\r*pow=on#\r",
        //     "Power Off": "\r*pow=off#\r",
        //     "Power State": "\r*pow=?#\r",
        //     "Mute On": "\r*mute=on#\r",
        //     "Mute Off": "\r*mute=off#\r",
        //     "Mute State": "\r*mute=?#\r",
        //     "Volume Up": "\r*vol=+#\r",
        //     "Volume Down": "\r*vol=-#\r",
        //     "Volume State": "\r*vol=?#\r",
        //     "Source Set": "\r*sour=",
        //     "Source Get": "\r*sour=?#\r"
        // }
        // this.buttons = {
        //   [Characteristic.RemoteKey.ARROW_UP]: '\r*up#\r',
        //   [Characteristic.RemoteKey.ARROW_DOWN]: '\r*down#\r',
        //   [Characteristic.RemoteKey.ARROW_LEFT]: '\rleft#\r',
        //   [Characteristic.RemoteKey.ARROW_RIGHT]: '\rright#\r',
        //   [Characteristic.RemoteKey.SELECT]: '\renter#\r',
        //   [Characteristic.RemoteKey.BACK]: '\r*menu=off#\r',
        //   [Characteristic.RemoteKey.EXIT]: '\r*menu=off#\r',
        //   [Characteristic.RemoteKey.INFORMATION]: '\r*menu=on#\r',
        // };

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
        [Characteristic.RemoteKey.ARROW_UP]: "*up#",
        [Characteristic.RemoteKey.ARROW_DOWN]: "*down#",
        [Characteristic.RemoteKey.ARROW_LEFT]: "*left#",
        [Characteristic.RemoteKey.ARROW_RIGHT]: "*right#",
        [Characteristic.RemoteKey.SELECT]: "*enter#",
        [Characteristic.RemoteKey.BACK]: "*menu=off#",
        [Characteristic.RemoteKey.EXIT]: "*menu=on#",
        [Characteristic.RemoteKey.INFORMATION]: "*menu=on#",
        };

        this.default_inputs = [
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
        // this._isReachable = false;
        this.serialPort = new Transport(this.adapter, this.log);

        this.serialPort.on('connected', this._onConnected.bind(this));
        this.serialPort.on('disconnected', this._onDisconnected.bind(this));
        // this.serialPort = new SerialPort(this.adapter, {
        //   baudRate: 115200,
        //   dataBits: 8,
        //   parity: 'none',
        //   stopBits: 1,
        //   rtscts: false,
        //   xoff: false,
        //   xon: false
        // }); //autoOpen: false this is the openImmediately flag [default is true]
        
        // Use a `\r` as a line terminator
        // const parser = new SerialPort.parsers.Readline({
        //   delimiter: '\r'
        // });
        
        // this.serialPort.pipe(parser);
        
        // parser.on('data', function(data) {
        //   this.log.info("Received data: " + data);
        //   this.readBuffer.push(data);
        // //   this.serialPort.close(function(error) {
        // //     this.log.info("Closing connection");
        // //     if(error) this.log.error("Error when closing connection: " + error)
        // //     var callback;
        //     // if(this.callbackQueue.length) callback = this.callbackQueue.shift()
        //     //   if(callback) callback(data,0);
        // //   }.bind(this)); // close after response
        // }.bind(this));
    }
// }
    
// BenQProjector.prototype = {

    //////////////////////////////
    // Serial Command Functions //
    //////////////////////////////

    async _onConnected() {
        this.log.info('Connected. Refreshing characteristics.');
        // await this._refreshSerialNumber();
        await this._refreshProjectorStatus();
    
        // this._setReachable(true);
    }

    _onDisconnected() {
        this.log.info('Disconnected');
        // this._setReachable(false);
    }

    async _sendCommand(cmd) {
        this.log.info("_sendCommand: %s", cmd)
        const response = await this.serialPort.execute(cmd);

        // Error handling
        if (response.indexOf("Block") > -1) {
            this.log.info("Block in response. Retrying.")
            setTimeout(() => {
                this._sendCommand(cmd);
              }, this.pollingInterval/2);
        } 
        if (response === ">") {
            this.log.info("Ready response returned. Retrying.")
            setTimeout(() => {
                this._sendCommand(cmd);
              }, this.pollingInterval/4);
        } 
        if (response === undefined) {
            this.log.info("Response was undefined. Retrying.")
            setTimeout(() => {
                this._sendCommand(cmd);
              }, this.pollingInterval/4);
        } 
        // else {
        //     return response;
        // }

        // Response handling
        if (response.indexOf("*pow=") > -1) {
          this.handlePowResponse(response);
        }
        if (response.indexOf("*sour=") > -1) {
          this.handleSourResponse(response);
        }

    }

    handlePowResponse(response) {
            if (response.indexOf("ON") > -1) {
                this.log.info('Power is On')
                this.state = true;
            }
            if (response.indexOf("OFF") > -1) {
                this.log.info('Power is Off')
                this.state = false;
            }
        
        this.tvService
            .getCharacteristic(Characteristic.Active)
            .updateValue(this.state);
    }

    handleSourResponse(response) {
        this.log.info("getInput response:")
        this.log.info(response)
        this.log.info("getInput lower:")
        this.log.info(response.toLowerCase())
        this.default_inputs.forEach((i, x) =>  {
          this.log.info(i.input)
          this.log.info(response.toLowerCase().indexOf(i.input.toLowerCase() +"#"))
            if (response.toLowerCase().indexOf(i.input.toLowerCase() +"#") > -1) {
            this.lastKnownSource = x;
            this.log.info("Input is %s", i.input);

            }
        })
        this.log.info("Setting ActiveIdentifier to:");
        this.log.info(this.lastKnownSource)
        this.tvService
            .getCharacteristic(Characteristic.ActiveIdentifier)
            .updateValue(this.lastKnownSource);
    }

    // _setReachable(state) {
    //     this.log(`Reachable: ${state}`);
    //     if (this._isReachable === state) {
    //       return;
    //     }
    
    //     this._isReachable = state;
    
    //     this._bridgingService.getCharacteristic(Characteristic.Reachable)
    //       .updateValue(this._isReachable);
    // }

    // getBridgingStateService() {
    //     this._bridgingService = new Service.BridgingState();
    
    //     this._bridgingService.getCharacteristic(Characteristic.Reachable)
    //       .updateValue(this._isReachable);
    
    //     this.enabledServices.push(this._bridgingService);
    //     // return this._bridgingService;
    // }
        
    // send: function(cmd, callback) {
    //     this.sendCommand(cmd, callback); 
    //     //if (callback) callback();
    // },
        
    // exec: function() {
    //     // Check if the queue has a reasonable size
    //     if(this.queue.length > 100) {
    //         this.queue.clear();
    //         this.callbackQueue.clear();
    //     }
        
    //     this.queue.push(arguments);
    //     this.process();
    // },
        
    // sendCommand: function(command, callback) {
    //     // this.log.info("serialPort.open");
    //     // if(this.serialPort.isOpen){
    //     //     this.log.info("serialPort is already open...");
    //     //     if(callback) callback(0,1);
    //     // }
    //     // else{
    //     //     this.serialPort.open(function (error) {
    //     //                      if(error) {
    //     //                         this.log.error("Error when opening serialport: " + error);
    //     //                         if(callback) callback(0,error);
    //     //                      }
    //     //                      else {
    //                              if(callback) this.callbackQueue.push(callback);
    //                              this.serialPort.write(command, function(err) {
    //                                                if(err) this.log.error("Write error = " + err);
    //                                                //this.serialPort.drain();
    //                                                }.bind(this));
    //                         //  }
    //                                     if(callback) callback(0,0);
    //                         //  }.bind(this));
    //     // }
    // },
        
    // process: function() {
    //     if (this.queue.length === 0) return;
    //     if (!this.ready) return;
    //     var self = this;
    //     this.ready = false;
    //     this.send.apply(this, this.queue.shift());
        
    //     setTimeout(function () {
    //                self.ready = true;
    //                self.process();
    //                }, this.timeout);
    // },






    ///////////////////////////
    // Functions for HomeKit //
    ///////////////////////////

    async _refreshProjectorStatus() {
        this.log.info('Refresh projector status');
    
        try {
            this.log.info('Refreshing power state.')
          await this.getPowerState();
          this.log.info('Power state refreshed.')

          if (this.state) {
            this.log.info('Refreshing input source.')
            await this.getInputSource();
            this.log.info('Input source refreshed.')
          }
        }
        catch (e) {
          // Do not leak the exception
          this.log.error(`Failed to refresh projector status: ${e}`);
        }
    
        // Schedule another update
        setTimeout(() => {
          this._refreshProjectorStatus();
        }, this.pollingInterval);
    }

    async getPowerState(callback) {
        // const powerState = await this.serialPort.execute(this.commands['Power State']);
        if (callback) {
          callback(null, this.state);
        }
        try {
            this.log.info('Getting power state.')
            await this._sendCommand(this.commands['Power State']);
            // this.log.info(`powerState is: ${powerState}`)
            // if (powerState.indexOf("ON") > -1) {
            //     this.log.info('Power is On')
            //     this.state = true;
            // }
            // if (powerState.indexOf("OFF") > -1) {
            //     this.log.info('Power is Off')
            //     this.state = false;
            // }

            // if (this.state === null) {
            //   throw new Error('Failed to process response to ' + this.commands['Power State']);
            // }
        }
        catch (e) {
            this.log.error(`Failed to get power state: ${e}`)
        }
        
        // this.tvService
        //     .getCharacteristic(Characteristic.Active)
        //     .updateValue(this.state);
    }

    // getPowerState: function(callback) {
    //     var cmd = this.commands['Power State'];
        
    //     this.log.info("getPowerState");
    //     var retry = 0;
    //     var readable = false;
        
    //     // while (retry < 5 && !readable) {
    //         this.exec(cmd, function(response,error) {
    //                 this.log.info("Power state is: " + response);
    //                 var tempResp = this.readBuffer.shift()
    //                 this.log.info("tempResp is: " + tempResp)
    //                 if (response && tempResp.indexOf("ON") > -1) {
    //                     readable = true;
    //                     if(callback) callback(null, true);
    //                 }
    //                 if (response && tempResp.indexOf("OFF") > -1) {
    //                     readable = true;
    //                     if(callback) callback(null, false);
    //                 }
    //                 }.bind(this))
    //         // retry++;
            
    //     // }
    //     if(!readable && callback) callback(null, false);
    // },
        
    async setPowerState(value, callback) {

        if (callback) {
            callback(null, value);
        }
        this.log.info(`Set projector power state to ${value}`);
        try {
          let cmd = this.commands['Power Off'];
          if (value) {
            cmd = this.commands['Power On'];
          }
    
        //   await this.serialPort.execute(cmd);
          await this._sendCommand(cmd);
          await this.getPowerState();
          this.state = value;
        }
        catch (e) {
          this.log.error(`Failed to set power state ${e}`);
        //   callback(e);
        }

        
    }

    // setPowerState: function(powerOn, callback) {
    //     var cmd;
        
    //     if (powerOn) {
    //         cmd = this.commands['Power On'];
    //         this.log.info("Set", this.name, "to on");
    //     }
    //     else {
    //         cmd = this.commands['Power Off'];
    //         this.log.info("Set", this.name, "to off");
    //     }

    //     this.exec(cmd, function(response,error) {
    //             this.log.info(response)
    //               if (error) {
    //               this.log.error('Serial power function failed: %s', error);
    //               if(callback) callback(error);
    //               }
    //               else {
    //               this.log.info('Serial power function succeeded!');
    //               if(callback) callback();
    //               }
    //               }.bind(this));
    // },
        
    // getMuteState: function(callback) {
    //     var cmd = this.commands['Mute State'];
        
    //     var retry = 0;
    //     var readable = false;

    //     // while (retry < 5 && !readable) {
    //         this.exec(cmd, function(response, error) {
    //             this.log.info(response)
    //                 this.log.info("Mute state is:", response);
    //                 if (response && response.indexOf("*MUTE=ON#") > -1) {
    //                     readable = true;
    //                     if(callback) callback(null, true);
    //                 }
    //                 if (response && response.indexOf("*MUTE=OFF#") > -1) {
    //                     readable = true;
    //                     if(callback) callback(null, false);
    //                 }
    //                 }.bind(this))
    //         // retry++;
    //     // }
    //     if(!readable && callback) callback(null, false);
    // },
        
    // setMuteState: function(muteOn, callback) {
    //     var cmd;
        
    //     if (muteOn) {
    //         cmd = this.commands['Mute On'];
    //         this.log.info(this.name, "muted");
    //     }
    //     else {
    //         cmd = this.commands['Mute Off'];
    //         this.log.info(this.name, "unmuted");
    //     }
        
    //     this.exec(cmd, function(response, error) {
    //               if (error) {
    //               this.log.error('Serial mute function failed: %s');
    //               callback(error);
    //               }
    //               else {
    //               this.log.info('Serial mute function succeeded!');
    //               callback();
    //               }
    //               }.bind(this));
    // },
        
    // getVolume: function(callback) {
    //     var cmd = this.commands['Volume State'];

    //     var retry = 0;
    //     var readable = false;

    //     // while (retry < 5 && !readable) {
    //         this.exec(cmd, function(response, error) {
    //             this.log.info(response);
    //             //VOL:xxxy(xxx)
    //             if(response && response.indexOf("*VOL=") > -1) {
    //                 var vol = Number(response.split('=')[1].split('#'));
    //                 if (vol) {
    //                     readable = true;
    //                     this.volume = vol;
    //                 }
                    
    //                 //   this.volume = this.dbToPercentage(Number(vol));
    //                 //console.log("this.volume=" + this.volume);
    //                 if (vol) {
    //                     callback(null, vol);
    //                 }
    //             }
    //         }.bind(this))
    //         // retry++;
    //     // }
    //     if (!readable && callback) {
    //         callback(null,0);
    //     }
    // },

    // setVolumeState: function(value, callback) {
    //     this.getVolume();
    //     var volDiff = this.volume - value;
    //     this.log.info("Setting volume to %s", value);
    //     if (volDiff > 0) {
    //         while (volDiff > 0)
    //         this.setVolumeRelative(Characteristic.VolumeSelector.INCREMENT)
    //     } else if (volDiff < 0) {
    //         while (volDiff < 0)
    //         this.setVolumeRelative(Characteristic.VolumeSelector.DECREMENT)
    //     }
    //     var cmd = this.commands['Volume State'];
        
    //     this.exec(cmd, function(response, error) {
                  
    //         //VOL:xxxy(xxx)
    //         if(response && response.indexOf("*VOL=") > -1) {
    //               var vol = Number(response.split('=')[1].split('#'));
    //             //   this.volume = this.dbToPercentage(Number(vol));
    //               //console.log("this.volume=" + this.volume);
    //               callback(null, vol);
    //         }
    //         else callback(null,0);
    //     }.bind(this))
    // },

    // setVolumeRelative: function(volumeDirection, callback) {
    //     // Change volume by pressing Volume Up or Volume Down
    //   if (volumeDirection == Characteristic.VolumeSelector.INCREMENT) {
    //     var cmd = this.commands['Volume Up'];
    //   } else if (volumeDirection == Characteristic.VolumeSelector.DECREMENT) {
    //     var cmd = this.commands['Volume Up'];
    //   } else {
    //     that.log.error( "setVolumeRelative - VOLUME : ERROR - unknown direction sent");
    //     callback(error);
    //   }

    //   this.exec(cmd, function(response, error) {
    //     if (error) {
    //         this.log.error('Serial change volume function failed: ' + error);
    //         callback(error);
    //     }
    //     else {
    //         this.log.info("Changing volume");
    //         callback();
    //     }
    // }.bind(this));
    // },

    async getInputSource(callback) {
        // const status = await this.serialPort.execute(this.commands['Source Get']);
        this.log.info("+++++ Getting source")
        if (callback) {
          callback(null, this.lastKnownSource);
        }
        try {
          await this._sendCommand(this.commands['Source Get']);
        // this.log.info("getInput status:")
        // this.log.info(status)
        // if (status.indexOf("*sour=") > -1) {
        //   var src = response.split("=")[1].split("#");
        //   this.default_inputs.forEach((i, x) =>  {
        //       if (i['name'] == src) {
        //           readable = true;
        //       this.lastKnownSource = x;
        //       this.log.info("Input is %s", i['name']);

        //       }
        //   })

            // return this.lastKnownSource;
        }
        catch (e) {
          this.log.error(`Failed to refresh Input state: ${this.commands['Source Get']} => ${e}`);
        }

        // this.log.info("Setting ActiveIdentifier to:");
        // this.log.info(this.lastKnownSource)
        // this.tvService
        //     .getCharacteristic(Characteristic.ActiveIdentifier)
        //     .updateValue(this.lastKnownSource);
    }
        
    // getInputSource: function(callback) {
    //     var cmd = this.commands['Source Get'];
        
    //     var retry = 0;
    //     var readable = false;

    //     // while (retry < 5 && !readable) {
    //         this.exec(cmd, function(response, error) {
    //             this.log.info(response);
    //             if(response && response.indexOf("*sour=") > -1) {
                    
    //                 var src = response.split("=")[1].split("#");
    //                 var srcNr = 0;
    //                 this.default_inputs.forEach((i, x) =>  {
    //                     if (i['name'] == src) {
    //                         readable = true;
    //                     srcNr = x;
    //                     this.log.info("Input is %s", i['name']);
    //                     }
    //                 })
    //                 //console.log("src =" + src + " srcNr = " + srcNr);
    //                 if (readable) {
    //                     callback(null, srcNr);
    //                 }
    //             }
    //         }.bind(this))
    //         // retry++;
    //     // }

    //     if (!readable && callback) {
    //         callback(null,0);
    //     }
    // },

    async setInputSource(source, callback) {
        this.log.info(`Set projector Input to ${source}`);
        if (callback) {
          callback();
        }
        var cmd = this.commands['Source Set'];
        var input = this.default_inputs[source];
        cmd = cmd + input['input'] + "#";

        try {
          
          this.log.info(`Sending setInputSource ${cmd}`);
        //   await this.serialPort.execute(cmd);
          await this._sendCommand(cmd);
        //   this.lastKnownSource = source;
        // //   callback(undefined);
        //   this.tvService
        //       .getCharacteristic(Characteristic.ActiveIdentifier)
        //       .updateValue(this.lastKnownSource);
    
          await this.getInputSource();
        }
        catch (e) {
          this.log.error(`Failed to set characteristic ${e}`);
          // callback(e);
        }

    }
        
    // setInputSource: function(port, callback) {
    //     var cmd = this.commands['Source Set'];
    //     var input = this.default_inputs[port];
    //     cmd = cmd + input['input'] + "#"
        
    //     this.log.info('Setting Input %s.', input['input'])
    //     this.log.info("Command %s", cmd)

    //     this.exec(cmd, function(response, error) {
    //         if (error) {
    //             this.log.error('Set Input function failed: ' + error);
    //             callback(error);
    //         }
    //         else {
    //             this.log.info('Set Input function succeeded!');
    //             callback();
    //         }
    //     }.bind(this));
    // },
        
    async identify(callback) {
        this.log.info("Identify requested!");
        
        await this.setPowerState(true); // turn on
        
        if(callback) callback();
    }

    async remoteKeyPress(button, callback) {
      if (callback) {
        callback();
      }
      if (this.buttons[button]) {
        var press = this.buttons[button]
      } else {
        this.log.error('Remote button %d not supported.', button)
        return
      }
      this.log.info("remoteKeyPress - INPUT: pressing key %s", press);
      try {
        await this._sendCommand(press);
      } catch (e) {
        this.log.error(`Failed to press remote key: ${e}`);
        // callback(e);
      }
    }

    addSources(service) {
      // If input name mappings are provided, use them.
      // Else, load all inputs from query (useful for finding inputs to map).
      this.default_inputs.forEach((i, x) =>  {
        if (this.inputs) {
          if (this.inputs[i['label']]) {
            var inputName = this.inputs[i['label']]
            let tmpInput = new Service.InputSource(inputName, 'inputSource' + x);
            tmpInput
              .setCharacteristic(Characteristic.Identifier, x)
              .setCharacteristic(Characteristic.ConfiguredName, inputName)
              .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
              .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION);
        
            service.addLinkedService(tmpInput);
            this.enabledServices.push(tmpInput);
          }
        } else {
          var inputName = i['label']
          let tmpInput = new Service.InputSource(inputName, 'inputSource' + x);
          tmpInput
            .setCharacteristic(Characteristic.Identifier, x)
            .setCharacteristic(Characteristic.ConfiguredName, inputName)
            .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION);
    
          service.addLinkedService(tmpInput);
          this.enabledServices.push(tmpInput);
        }
      })
    
    }
        
    getServices() {
        
        var informationService = new Service.AccessoryInformation();
        informationService
        .setCharacteristic(Characteristic.Name, this.name)
        .setCharacteristic(Characteristic.Manufacturer, "BenQ")
        .setCharacteristic(Characteristic.Model, this.model)
        .setCharacteristic(Characteristic.SerialNumber, "-");

        this.enabledServices.push(informationService);

        this.tvService = new Service.Television(this.name);

        this.tvService
          .setCharacteristic(Characteristic.ConfiguredName, this.name);
      
        this.tvService
          .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
      
        this.addSources(this.tvService)

        this.tvService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getPowerState.bind(this))
            .on('set', this.setPowerState.bind(this));

        // this.tvService
        //   .getCharacteristic(Characteristic.On)
        //   .on('get', this.getPowerState.bind(this))
        //   .on('set', this.setPowerState.bind(this));

        this.tvService
            .getCharacteristic(Characteristic.ActiveIdentifier)
            .on('set', this.setInputSource.bind(this))
            .on('get', this.getInputSource.bind(this));
      
        this.tvService
            .getCharacteristic(Characteristic.RemoteKey)
            .on('set', this.remoteKeyPress.bind(this));
        
        this.enabledServices.push(this.tvService);
        // this.prepareTvSpeakerService();
        // this.getBridgingStateService();
        return this.enabledServices;
    }
    
};

// BenQProjector.prototype.prepareTvSpeakerService = function() {

//   this.tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService');
//   this.tvSpeakerService
//       .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
//       .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
//   this.tvSpeakerService
//       .getCharacteristic(Characteristic.VolumeSelector)
//       .on('set', this.setVolumeRelative.bind(this));
//   this.tvSpeakerService
//       .getCharacteristic(Characteristic.Mute)
//       .on('get', this.getMuteState.bind(this))
//       .on('set', this.setMuteState.bind(this));
//   this.tvSpeakerService
//       .addCharacteristic(Characteristic.Volume)
//       .on('get', this.getVolume.bind(this))
//       .on('set', this.setVolumeState.bind(this));

//   this.tvService.addLinkedService(this.tvSpeakerService);
//   this.enabledServices.push(this.tvSpeakerService);

// };