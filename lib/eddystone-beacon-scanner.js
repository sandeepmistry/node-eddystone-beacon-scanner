// force reporting all HCI events on Linux
process.env['NOBLE_REPORT_ALL_HCI_EVENTS'] = 1;

var events = require('events');
var util = require('util');
var forge = require('node-forge');

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


EddystoneBeaconScanner.prototype.startScanning = function(allowDuplicates, gracePeriod, encryption) {
  debug('startScanning');

  var startScanningOnPowerOn = function() {
    if (noble.state === 'poweredOn') {
      noble.startScanning([SERVICE_UUID], allowDuplicates);
    } else {
      noble.once('stateChange', startScanningOnPowerOn);
    }
  };

  startScanningOnPowerOn();

  this._scaler = 12;
  this._secret = forge.util.hexToBytes("00112233445566778899AABBCCDDEEFF");
  this._cipher = forge.cipher.createCipher('AES-ECB', this._secret);

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

  var txPower = beacon.txPower;
  if (txPower !== undefined) {
    beacon.distance = this.calculateDistance(txPower, rssi);
  }

  return beacon;
};

EddystoneBeaconScanner.prototype.parseEidData = function(data) {
  return {
    txPower: data.readInt8(1),
    eid: this.decipher(data.slice(2, 9))
  };
};
EddystoneBeaconScanner.prototype.getSeconds = function () {
  return Math.floor((new Date).getTime()/1000);
};

EddystoneBeaconScanner.prototype.computeTempKey = function (seconds) {
  // TODO: Avoid recalculating.
  var buffer = Buffer.alloc(16);
  buffer.fill(0x00, 0, 11); // Padding
  buffer.fill(0xFF, 11, 12); // Salt
  buffer.fill(0x00, 12, 14); // Padding
  buffer.fill((seconds & 0xff000000) >> 24, 14, 15); // 16 first bits of the
  buffer.fill((seconds & 0x00ff0000) >> 16, 15, 16); // time counter big endian.
  try {
    this._cipher.start();
    this._cipher.update(forge.util.createBuffer(buffer, 'binary'));
    return this._cipher.output.toHex();
  } finally {
    this._cipher.finish();
  }
};

EddystoneBeaconScanner.prototype.computeEid = function (seconds, scaler, tempKey) {
  // TODO: Check scaler.
  var buffer = Buffer.alloc(16);
  buffer.fill(0x00, 0, 11); // Padding
  buffer.writeUInt8(scaler, 11);
  //buffer.writeUInt32BE(Math.floor(seconds / (2 ^ scaler)) * (2 ^ scaler), 12, true);
  buffer.writeUInt32BE((seconds >> scaler) << scaler, 12, true);

  var cipher = forge.cipher.createCipher('AES-ECB', forge.util.hexToBytes(tempKey));
  try {
    cipher.start();
    cipher.update(forge.util.createBuffer(buffer, 'binary'));
    return cipher.output.toHex().slice(0,14);
  } finally {
    cipher.finish();
  }
};

EddystoneBeaconScanner.prototype.decipher = function (data) {
  var seconds = this.getSeconds();
  var tempKey = this.computeTempKey(seconds);
  var eid = this.computeEid(seconds, this._scaler, tempKey);
  return eid === data.toString('hex');
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
    url: urlDecode(data.slice(2))
  };
};

EddystoneBeaconScanner.prototype.parseTlmData = function(data) {
  return {
    tlm: {
      version: data.readUInt8(1),
      vbatt: data.readUInt16BE(2),
      temp: data.readInt16BE(4) / 256,
      advCnt: data.readUInt32BE(6),
      secCnt: data.readUInt32BE(10)
    }
  };
};

EddystoneBeaconScanner.prototype.calculateDistance = function(txPower, rssi) {
  return Math.pow(10, ((txPower - rssi) - 41) / 20.0);
};

module.exports = EddystoneBeaconScanner;
