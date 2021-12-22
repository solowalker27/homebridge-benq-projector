# homebridge-benq-projector v2.1.1
Homebridge plugin for BenQ projectors via serial RS232 as HomeKit TVs. Requires iOS >=12.2 and homebridge >=0.4.46.

## Description
This plugin connects to a BenQ projector via serial RS232. Developed and tested using a Raspberry Pi and a USB to serial RS232 cable to connect to a BenQ W1070.

## Installation instructions

1. Install [homebridge](https://github.com/nfarina/homebridge)
2. Connect to projector via RS232
3. Install this plugin:
```
npm install -g homebridge-benq-projector
```
4. Update your config.json, following the example below

## Example configuration

 ```json
{
    "bridge": {
      ...
    },
    "accessories": [
      ...
    ],
    "platforms": [{
        "platform": "BenQ-Projector",
        "devices": [
            {
                "name": "BenQ w1070",
                "model": "W1070",
                "adapter": "/dev/ttyUSB0",
                "inputs": [
                    { "input": "hdmi", "label": "Apple TV" },
                    { "input": "RGB", "label": "Computer" },
                    { "input": "ypbr", "label": "Component" },
                    { "input": "hdmi2", "label": "Raspberry Pi" },
                    { "input": "vid", "label": "Composite" },
                    { "input": "svid", "label": "S-Video" }
                ],
                "baudrate": 9600
            }
        ]
      }]
}

 ```

## Configuration

### General configuration

| **Attributes** | **Required** | **Usage** |
|------------|----------|-------|
| platform | **Yes** | Name of homebridge accessory plugin. Must be **BenQ-Projector**.   |
| devices | **Yes** | Array of BenQ projectors. Each of them must be added manually to the Home app!   |

### Device configuration

| **Attributes** | **Required** | **Usage** |
|------------|----------|-------|
| name | **Yes** | Name of the projector, how you want it to appear in HomeKit. |
| adapter | **Yes** | Path to serial RS232 adapter. |
| model | No | Projector model. Only displayed in accessory details in HomeKit. |
| pollingInterval | No | Polling interval in milliseconds _(Default: 6000)_ |
| inputs | No | List of inputs to populate in the TV interface in HomeKit. Must be `input` and `label` pair, where `input` is input according to the projector and `label` is how it will be listed in HomeKit. Label changes made in the Home app or elsewhere are not saved and must be defined here. If no list is provided, a default list is used of inputs supported by W1070. |
| baudrate | No | baudrate for your device. Default is 115200.

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

## Convert to v2.0.0
If you want to update to v2.0.0 or higher you'll need to adjust your configuration. The reason for that is the conversion from an accessory plugin to a platform plugin.

Example config before v2.0.0:

```json
{
    "accessory": "BenQ-Projector",
    "name": "BenQ w1070",
    "model": "W1070",
    "adapter": "/dev/ttyUSB0",
    "inputs": [
        { "input": "hdmi", "label": "Apple TV" },
        { "input": "RGB", "label": "Computer" },
        { "input": "ypbr", "label": "Component" },
        { "input": "hdmi2", "label": "Raspberry Pi" },
        { "input": "vid", "label": "Composite" },
        { "input": "svid", "label": "S-Video" }
    ],
    "baudrate": 9600
}
```

The same config, that works with the v2.0.0:

```json
{
    "platform": "BenQ-Projector",
    "devices": [
        {
            "name": "BenQ w1070",
            "model": "W1070",
            "adapter": "/dev/ttyUSB0",
            "inputs": [
                { "input": "hdmi", "label": "Apple TV" },
                { "input": "RGB", "label": "Computer" },
                { "input": "ypbr", "label": "Component" },
                { "input": "hdmi2", "label": "Raspberry Pi" },
                { "input": "vid", "label": "Composite" },
                { "input": "svid", "label": "S-Video" }
            ],
            "baudrate": 9600
        }
    ]
}
```

In addition to the config changes, you'll need to move the plugin config from the `"accessories": [...]` to `"platforms": [...]` section of your HomeBridge instance.


## Known issues 
- None.

## Changelog
v2.1.1
- Fix reference to current serial-io package version.

v2.1.0
- Add Picture Mode characteristic. Fix serial port conflicts, callback issues, and possible volume polling issues. Thanks @mlaurijsse!

v2.0.1
- Update serial-io dependency.

v2.0.0 **BREAKING CHANGE**
- Converted plugin to a HomeBridge Platform due to HomeKit limitations. In order to use multiple TVs in HomeKit, they need to be exposed as spearate external accessories. This feature is only available to platform plugins.

v1.1.0
- Switch from the borrowed Transport.js to serial-io package for serial communication. Should increase long term speed and stability.

v1.0.6
- Upgrade dependencies (thanks @alehaa)
- Add ability to configure baudrate (thanks @sir-bedevere)
- Add config schema for homebridge-config-ui-x support

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
