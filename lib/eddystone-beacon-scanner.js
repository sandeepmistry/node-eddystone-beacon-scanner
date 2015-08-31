var events = require('events');
var util = require('util');

var debug = require('debug')('uri-beacon-scanner');

var noble = require('noble');
var urlDecode = require('eddystone-url-encoding').decode;

var SERVICE_UUID = 'feaa';

var UID_FRAME_TYPE = 0x00;
var URL_FRAME_TYPE = 0x10;
var TLM_FRAME_TYPE = 0x20;

var EXIT_GRACE_PERIOD = 5000; // milliseconds

var inRange = [];

var EddystoneBeaconScanner = function() {
  noble.on('discover', this.didFindBeacon.bind(this));
};

util.inherits(EddystoneBeaconScanner, events.EventEmitter);

EddystoneBeaconScanner.prototype.startScanning = function(allowDuplicates) {
  debug('startScanning');

  var startScanningOnPowerOn = function() {
    if (noble.state === 'poweredOn') {
      noble.startScanning([SERVICE_UUID], allowDuplicates);
    } else {
      noble.once('stateChange', startScanningOnPowerOn);
    }
  };
  
  var didLoseBeacon = setInterval(this.didLoseBeacon.bind(this), EXIT_GRACE_PERIOD / 2);

  startScanningOnPowerOn();
};

EddystoneBeaconScanner.prototype.stopScanning = function() {
  debug('stopScanning');
  
  noble.stopScanning();
  clearInterval(didLoseBeacon);
};

EddystoneBeaconScanner.prototype.didFindBeacon = function(peripheral) {
  debug('didFindBeacon: %s', peripheral);

  if (this.isEddyStoneBeacon(peripheral) === true) {

    this.cacheBeacon(peripheral);

    var beaconInfo = this.parseBeacon(peripheral);

    debug('didFindBeacon: Beacon = %s', JSON.stringify(beaconInfo));
    this.emit('didFindBeacon', beaconInfo);
  }
};

EddystoneBeaconScanner.prototype.didLoseBeacon = function() {
  for (var id in inRange) {
    if (inRange[id].lastSeen < (Date.now() - EXIT_GRACE_PERIOD)) {
      var peripheral = inRange[id].peripheral;
      var lostBeacon = this.parseBeacon(peripheral);

      this.emit('didLoseBeacon', lostBeacon);

      delete inRange[id];
    }
  }
};

EddystoneBeaconScanner.prototype.isEddyStoneBeacon = function(peripheral) {
  var serviceData = peripheral.advertisement.serviceData;

  // make sure service data is present, with the expected uuid and data length
  return ( serviceData &&
           serviceData.length > 0 &&
           serviceData[0].uuid === SERVICE_UUID &&
           serviceData[0].data.length > 2
         );
};

EddystoneBeaconScanner.prototype.cacheBeacon = function(peripheral) {
  var id = peripheral.id;
  var entered = !inRange[id];

  if (entered) {
    inRange[id] = {
      peripheral: peripheral
    };
  }
    
  inRange[id].lastSeen = Date.now();
};

EddystoneBeaconScanner.prototype.parseBeacon = function(peripheral) {
  var frameType = this.getFrameType(peripheral.advertisement.serviceData[0].data[0]);

  switch(frameType) {
      case 'uid':
        return this.parseUidFrame(peripheral);
        break;

      case 'url':
        return this.parseUrlFrame(peripheral);
        break;

      case 'tlm':
        return this.parseTlmFrame(peripheral);
        break;
    }
};

EddystoneBeaconScanner.prototype.parseUidFrame = function(peripheral) {
  var data = peripheral.advertisement.serviceData[0].data;

  return {
    frameType: this.getFrameType(data.readUInt8(0)),
    txPower: data.readInt8(1),
    namespace: data.slice(2, 12).toString('hex'),
    instance: data.slice(12, 18).toString('hex'),
    rssi: peripheral.rssi,
    distance: this.calculateDistance(data.readUInt8(1), peripheral.rssi)
  };
};

EddystoneBeaconScanner.prototype.parseUrlFrame = function(peripheral) {
  var data = peripheral.advertisement.serviceData[0].data;

  return {
    frameType: this.getFrameType(data.readUInt8(0)),
    txPower: data.readInt8(1),
    url: urlDecode(data.slice(2)),
    rssi: peripheral.rssi,
    distance: this.calculateDistance(data.readUInt8(1), peripheral.rssi)
  };
};

EddystoneBeaconScanner.prototype.parseTlmFrame = function(peripheral) {
  var data = peripheral.advertisement.serviceData[0].data;
  console.log('TLM Frame', data);
};

EddystoneBeaconScanner.prototype.getFrameType = function(frameType) {
  switch(frameType) {
    case UID_FRAME_TYPE: 
      return 'uid';
      break;
    case URL_FRAME_TYPE:
      return 'url'
      break;
    case TLM_FRAME_TYPE:
      return 'tlm'
      break;
    default:
      throw new Error('Invalid Frametype');
      break;
  }
};

EddystoneBeaconScanner.prototype.calculateDistance = function(txPower, rssi) {
  // return Math.pow(10, ((txPower - rssi) - 41) / 20.0);

  /* 
  The distance is an estimate, and the accuracy will vary based
  on the accuracy of the samples provided and the wireless
  characteristics of your environment.  It will most likely only
  be accurate to a few feet, as triangulation is not used.
  However, it does provide some entertainment value. 
  */

  var average = 1.0;  // must be outside value range (-0dBm to -127dBm)

  // number of samples in the average
  var samples = 20;

  // sample #1 from environment (rssi -45dBm = distance 1.5ft)
  var r1 = -45;
  var d1 = 1.5;

  // sample #2 from environment (rssi -75dBm = distance 20ft)
  var r2 = -75;
  var d2 = 20;

  /* 
  constant to account for loss due to reflection, polzarization, etc
  n will be ~2 for an open space
  n will be ~3 for "typical" environment
  n will be ~4 for a cluttered industrial site 
  */

  var n = (r2 - r1) / (10 * Math.log10(d1 / d2));

  // initialize average with instaneous value to counteract the initial smooth rise
  if (average == 1.0)
    average = rssi;

  // single pole low pass recursive IIR filter
  average = rssi * (1.0 / samples) + average * (samples - 1.0) / samples;

  // approximate distance  
  var distance = d1 * Math.pow(10, (r1 - average) / (10 * n));

  // intensity (based on distance[linear] not rssi[logarithmic])
  var d = distance;
  if (d < d1)
    d = d1;
  else if (d > d2)
    d = d2;

  var intensity = (d2 - d) / (d2 - d1) * 255;

  return (distance);
};

module.exports = EddystoneBeaconScanner;
