# node-uri-beacon-scanner

Scan for [UriBeacon](https://github.com/google/uribeacon)'s using node.js

Use's [noble](https://github.com/sandeepmistry/noble) for BLE peripheral scanning, then attempts to parse discovered peripherals using the [UriBeacon Advertising Packet Specification](https://github.com/google/uribeacon/blob/master/specification/AdvertisingMode.md) 

## Setup

```sh
npm install uri-beacon-scanner
```

## Examples

See [examples](examples) folder.


## Usage

```javascript
var UriBeaconScanner = require('uri-beacon-scanner');
```

### Register discover event handler

```javascript
UriBeaconScanner.on('discover', function(uriBeacon) {
  // ...
});
```

The ```uriBeacon``` object will have the following properties:

 * ```uri``` - (expanded) URI the beacon is broadcasting
 * ```flags``` - flags
 * ```txPower``` - measured received power at 0 m in dBm
 * ```rssi``` - RSSI of discovered beacon

### Start scanning

Start scanning for UriBeacon's, you can specify whether to allow duplicates (default is false).

```javascript
UriBeaconScanner.startScannning(allowDuplicates);
```

### Stop scanning

Stop scanning for UriBeacon's.

```javascript
UriBeaconScanner.stopScannning();
```
