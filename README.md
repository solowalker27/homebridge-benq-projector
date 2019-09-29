# homebridge-benq-projector v1.0.5
Homebridge plugin for BenQ projectors via serial RS232 as HomeKit TVs. Requires iOS >=12.2 and homebridge >=0.4.46.

## Description
This plugin connects to a BenQ projector via serial RS232. Developed and tested using a Raspberry Pi and a USB to serial RS232 cable to connect to a BenQ W1070. Most of the serial code (`Transport.js`) sourced from [homebridge-epson-rs232](https://github.com/grover/homebridge-epson-projector-rs232). [homebridge-marantz-rs232](https://github.com/rooi/homebridge-marantz-rs232) was also referenced.

## Installation instructions

1. Install [homebridge](https://github.com/nfarina/homebridge)
2. Connect to projector via RS232
3. Install this plugin:
```
npm install -g homebridge-benq-projector
```
4. Update your config.json, following the example below

## Example accessory

 ```
{
 "bridge": {
   ...
},
 "accessories": [{
      "accessory": "BenQ-Projector",
      "name": "Projector",
      "model": "W1070",
      "adapter": "/dev/ttyUSB0",
      "inputs": [
        {"input": "hdmi", "label": "Apple TV"},
        {"input": "RGB", "label": "Computer"},
        {"input": "ypbr", "label": "Component"},
        {"input": "hdmi2", "label": "Raspberry Pi"},
        {"input": "vid", "label": "Composite"},
        {"input": "svid", "label": "S-Video"}
      ] 
}],
 "platforms": [
    ...
 ]
}

 ```

 ## Configuration

| **Attributes** | **Required** | **Usage** |
|------------|----------|-------|
| accessory | **Yes** | Name of homebridge accessory plugin. Must be **BenQ-Projector**.   |
| name | **Yes** | Name of the projector, how you want it to appear in HomeKit. |
| adapter | **Yes** | Path to serial RS232 adapter. |
| model | No | Projector model. Only displayed in accessory details in HomeKit. |
| pollingInterval | No | Polling interval _(Default: 3s)_ |
| inputs | No | List of inputs to populate in the TV interface in HomeKit. Must be `name` and `label` pair, where `name` is input according to the projector and `label` is how it will be listed in HomeKit. Label changes made in the Home app or elsewhere are not saved and must be defined here. If no list is provided, a default list is used of inputs supported by W1070. |

## List of known possible inputs
| **Input** | **Default Label/Interface** |
|-----------|-----------------------------|
| `hdmi` | HDMI 1 |
| `RGB` | COMPUTER/YPbPr |
| `ypbr` | Component |
| `hdmi2` | HDMI 2 |
| `vid` | Composite |
| `svid` | S-Video |
| `RGB2` | COMPUTER 2/YPbPr2 |
| `dviA` | DVI-A |
| `dvid` | DVI-D |
| `network` | Network |
| `usbdisplay` | USB Display |
| `usbreader` | USB Reader |


## Known issues 

- ~Occasional minor performance or stability issues. May result in delayed response from projector. In severe cases, the serial connection can get so out of sync a restart of homebridge might be necessary.~
- As of v1.0.3 there are no known issues. Performance isn't perfect but that seems to be the nature of this type of connection.

## Changelog
v1.0.5:
- Stability improvements and iOS 13 fix by adding services in the correct order (thanks @AlexanderBabel).

v1.0.4:
- Fixed typo in debug logging that could cause accessory to become unresponsive.

v1.0.3:
- Fixed stability issues by reintroducing some things originally removed from Transport.js. Partially fix and partially hide performance issues by doing callbacks sooner and freeing up HomeKit sooner.

v1.0.2:
- Fixed user defined input list.

v1.0.1:
- Fixed a bug referencing package version as accessory firmware version.

v1.0:
- Initial release.


## Contributing

You can contribute to this homebridge plugin in following ways:

- [Report issues](https://github.com/solowalker27/homebridge-benq-projector/issues) and help verify fixes as they are checked in.
- Contribute bug fixes.
- Contribute changes to extend the capabilities

Pull requests may be accepted.
