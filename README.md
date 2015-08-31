# node-eddystone-beacon-scanner

Scan for [Eddystone beacon's](https://github.com/google/eddystone) using Node.js

Use's [noble](https://github.com/sandeepmistry/noble) for BLE peripheral scanning, then attempts to parse discovered peripherals using the [Eddystone Protocol Specification](https://github.com/google/eddystone/blob/master/protocol-specification.md)

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

### Register event handlers

##### didFindBeacon
```javascript
EddystoneBeaconScanner.on('didFindBeacon', function(beacon) {
  // ...
});
```

##### didLoseBeacon

```javascript
EddystoneBeaconScanner.on('didLoseBeacon', function(beacon) {
  // ...
});
```

The ```beacon``` object will have the following properties depending on the frame type:
##### URL

 * ```frameType``` - Eddystone frametype
 * ```txPower``` - Measured received power at 0 m in dBm
 * ```url``` - (expanded) URL the beacon is broadcasting
 * ```rssi``` - RSSI of discovered beacon
 * ```distance``` - Approximate distance from beacon

##### UID
 * ```frameType``` - Eddystone frametype
 * ```txPower``` - Measured received power at 0 m in dBm
 * ```namespace``` - 10-byte ID Namespace
 * ```instance``` - 6-byte ID Instance
 * ```rssi``` - RSSI of discovered beacon
 * ```distance``` - Approximate distance from beacon



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
