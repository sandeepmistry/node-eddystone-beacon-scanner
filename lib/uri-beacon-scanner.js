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
  
    var id = peripheral.id;
    var entered = !inRange[id];

    if (entered) {
      inRange[id] = {
        peripheral: peripheral
      };
    }
      
    inRange[id].lastSeen = Date.now();

    var beaconInfo = this.parseBeacon(peripheral);

    debug('didFindBeacon: uriBeacon = %s', JSON.stringify(beaconInfo));
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

EddystoneBeaconScanner.prototype.parseBeacon = function(peripheral) {
  var frameType = this.getFrameType(peripheral.advertisement.serviceData[0].data[0]);

  switch(frameType) {
      case 'uid':
        return this.parseUidBeacon(peripheral);
        break;

      case 'url':
        return this.parseUrlBeacon(peripheral);
        break;

      case 'tlm':
        console.log('TLM FRAME');
        break;
    }
};

EddystoneBeaconScanner.prototype.parseUidBeacon = function(peripheral) {
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

EddystoneBeaconScanner.prototype.parseUrlBeacon = function(peripheral) {
  var data = peripheral.advertisement.serviceData[0].data;

  return {
    frameType: this.getFrameType(data.readUInt8(0)),
    txPower: data.readInt8(1),
    uri: urlDecode(data.slice(2)),
    rssi: peripheral.rssi,
    distance: this.calculateDistance(data.readUInt8(1), peripheral.rssi)
  };
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
  return Math.pow(10, ((txPower - rssi) - 41) / 20.0);
};

module.exports = EddystoneBeaconScanner;
