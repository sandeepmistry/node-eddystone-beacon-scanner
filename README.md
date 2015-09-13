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

#### Found

Triggered when a beacon is first found.


```javascript
EddystoneBeaconScanner.on('found', function(beacon) {
  // ...
});
```

#### Updated

Triggered when a beacon advertisement detected.

```javascript
EddystoneBeaconScanner.on('updated', function(beacon) {
  // ...
});
```

#### Lost

Triggered when a beacon has not been detected for 5 seconds.

```javascript
EddystoneBeaconScanner.on('lost', function(beacon) {
  // ...
});
```

The ```beacon``` object will have the following properties depending on the frame type:
##### URL

 * ```type``` - Eddystone type
 * ```txPower``` - Measured received power at 0 m in dBm
 * ```url``` - (expanded) URL the beacon is broadcasting
 * ```tlm``` - TLM data, only present when interleaved broadcasts are used by the beacon
 * ```rssi``` - RSSI of discovered beacon
 * ```distance``` - Approximate distance from beacon

##### UID
 * ```type``` - Eddystone type
 * ```txPower``` - Measured received power at 0 m in dBm
 * ```namespace``` - 10-byte ID Namespace
 * ```instance``` - 6-byte ID Instance
 * ```tlm``` - TLM data, only present when interleaved broadcasts are used by the beacon
 * ```rssi``` - RSSI of discovered beacon
 * ```distance``` - Approximate distance from beacon

##### TLM
 * ```tlm```
   * ```version``` - TLM version
   * ```vbatt``` - Battery voltage
   * ```temp``` - Temperature
   * ```advCnt``` - Advertising PDU count
   * ```secCnt``` - Time since power-on or reboot
 * ```rssi``` - RSSI of discovered beacon
 * ```distance``` - Approximate distance from beacon

### Start scanning

Start scanning for Eddystone beacons, you can specify whether to allow duplicates (default is false).

```javascript
EddystoneBeaconScanner.startScannning(allowDuplicates);
```

__Note:__ the ```lost``` event will only be triggered when ```allowDuplicates``` is set to true

### Stop scanning

Stop scanning for Eddystone beacons.

```javascript
EddystoneBeaconScanner.stopScannning();
```
