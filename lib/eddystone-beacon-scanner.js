// force reporting all HCI events on Linux
process.env['NOBLE_REPORT_ALL_HCI_EVENTS'] = 1;

var events = require('events');
var util = require('util');

var debug = require('debug')('eddystone-beacon-scanner');

var noble = require('noble');
var urlDecode = require('eddystone-url-encoding').decode;

var SERVICE_UUID = 'feaa';

var UID_FRAME_TYPE = 0x00;
var URL_FRAME_TYPE = 0x10;
var TLM_FRAME_TYPE = 0x20;
var EID_FRAME_TYPE = 0x30;

var EXIT_GRACE_PERIOD = 5000; // milliseconds

var EddystoneBeaconScanner = function() {
  this._discovered = {};

  noble.on('discover', this.onDiscover.bind(this));
};

util.inherits(EddystoneBeaconScanner, events.EventEmitter);

EddystoneBeaconScanner.prototype.startScanning = function(allowDuplicates, gracePeriod) {
  debug('startScanning');

  var startScanningOnPowerOn = function() {
    if (noble.state === 'poweredOn') {
      noble.startScanning([SERVICE_UUID], allowDuplicates);
    } else {
      noble.once('stateChange', startScanningOnPowerOn);
    }
  };

  startScanningOnPowerOn();

  this._gracePeriod = (gracePeriod === undefined) ? EXIT_GRACE_PERIOD : gracePeriod;
  this._allowDuplicates = allowDuplicates;
  if (allowDuplicates) {
    this._lostCheckInterval = setInterval(this.checkLost.bind(this), this._gracePeriod / 2);
  }
};

EddystoneBeaconScanner.prototype.stopScanning = function() {
  clearInterval(this._lostCheckInterval);

  debug('stopScanning');
  noble.stopScanning();
};

EddystoneBeaconScanner.prototype.onDiscover = function(peripheral) {
  debug('onDiscover: %s', peripheral);

  if (this.isBeacon(peripheral)) {
    var beacon = this.parseBeacon(peripheral);
    beacon.lastSeen = Date.now();

    var oldBeacon = this._discovered[peripheral.id];

    if (!oldBeacon) {
      this.emit('found', beacon);
    } else {
      var toCopy;

      if (beacon.type === 'tlm') {
        toCopy = ['type', 'url', 'namespace', 'instance'];
      } else {
        toCopy = ['tlm'];
      }

      toCopy.forEach(function(property) {
        if (oldBeacon[property] !== undefined) {
          beacon[property] = oldBeacon[property];
        }
      });
    }

    this._discovered[peripheral.id] = beacon;

    this.emit('updated', beacon);
  }
};

EddystoneBeaconScanner.prototype.checkLost = function() {
  for (var id in this._discovered) {
    var beacon = this._discovered[id];

    if (this._discovered[id].lastSeen < (Date.now() - this._gracePeriod)) {
      this.emit('lost', beacon);

      delete this._discovered[id];
    }
  }
};

EddystoneBeaconScanner.prototype.isBeacon = function(peripheral) {
  var serviceData = peripheral.advertisement.serviceData;

  // make sure service data is present, with the expected uuid and data length
  return ( serviceData &&
           serviceData.length > 0 &&
           serviceData[0].uuid === SERVICE_UUID &&
           serviceData[0].data.length > 2
         );
};

EddystoneBeaconScanner.prototype.parseBeacon = function(peripheral) {
  var data = peripheral.advertisement.serviceData[0].data;
  var frameType = data.readUInt8(0);

  var beacon = {};
  var type = 'unknown';
  var rssi = peripheral.rssi;

  switch (frameType) {
    case UID_FRAME_TYPE:
      type = 'uid';
      beacon = this.parseUidData(data);
      break;

    case URL_FRAME_TYPE:
      type = 'url';
      beacon = this.parseUrlData(data);
      break;

    case TLM_FRAME_TYPE:
      type = 'tlm';
      beacon = this.parseTlmData(data);
      break;

    case EID_FRAME_TYPE:
      type = 'eid';
      beacon = this.parseEidData(data);
      break;

    default:
      break;
  }

  beacon.id = peripheral.id;
  beacon.type = type;
  beacon.rssi = rssi;
  beacon.address = peripheral.address

  var txPower = beacon.txPower;
  if (txPower !== undefined) {
    beacon.distance = this.calculateDistance(txPower, rssi);
  }

  return beacon;
};

EddystoneBeaconScanner.prototype.parseUidData = function(data) {
  return {
    txPower: data.readInt8(1),
    namespace: data.slice(2, 12).toString('hex'),
    instance: data.slice(12, 18).toString('hex'),
  };
};

EddystoneBeaconScanner.prototype.parseUrlData = function(data) {
  return {
    txPower: data.readInt8(1),
    url: urlDecode(data.slice(2)),
    prefix: this.prefix(data.readInt8(2))
  };
};

EddystoneBeaconScanner.prototype.parseTlmData = function(data) {
  return {
    version: data.readUInt8(1),
    battery: data.readUInt16BE(2),
    temperature: data.readInt16BE(4) / 256,
    pdu: data.readUInt32BE(6),
    time: data.readUInt32BE(10)
  };
};

EddystoneBeaconScanner.prototype.parseEidData = function(data) {
  return {
      txPower: data.readInt8(1),
      eid: data.slice(2, 10).toString('hex')
  };
};

EddystoneBeaconScanner.prototype.calculateDistance = function(txPower, rssi) {
  return Math.pow(10, ((txPower - rssi) - 41) / 20.0);
};

EddystoneBeaconScanner.prototype.prefix = function(number){
  switch(number){
    case 0:
      return 'http://www.'
      break;

    case 1:
      return 'https://www.'
      break;

    case 2:
      return 'http://'
      break;

    case 3:
      return 'https://'
      break;
  }
}

module.exports = EddystoneBeaconScanner;
