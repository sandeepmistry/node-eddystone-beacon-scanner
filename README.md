# node-eddystone-beacon-scanner

Scan for [Eddystone beacon's](https://github.com/google/eddystone) using Node.js

Use's [noble](https://github.com/sandeepmistry/noble) for BLE peripheral scanning, then attempts to parse discovered peripherals using the [Eddystone Protocol Specification](https://github.com/google/eddystone/blob/master/protocol-specification.md)

__Note:__ Only supports Eddystone-URL beacons currently.

## Setup

```sh
npm install eddystone-beacon-scanner
```

## Examples

See [examples](examples) folder.


## Usage

```javascript
var EddystoneBeaconScanner = require('eddystone-beacon-scanner');
```

### Register discover event handler

```javascript
EddystoneBeaconScanner.on('discover', function(beacon) {
  // ...
});
```

The ```beacon``` object will have the following properties:

 * ```url``` - (expanded) URL the beacon is broadcasting
 * ```type``` - 'url'
 * ```txPower``` - measured received power at 0 m in dBm
 * ```rssi``` - RSSI of discovered beacon

### Start scanning

Start scanning for Eddystone beacons, you can specify whether to allow duplicates (default is false).

```javascript
EddystoneBeaconScanner.startScannning(allowDuplicates);
```

### Stop scanning

Stop scanning for Eddystone beacons.

```javascript
EddystoneBeaconScanner.stopScannning();
```
