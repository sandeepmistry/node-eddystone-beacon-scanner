var events = require('events');
var util = require('util');

var debug = require('debug')('uri-beacon-scanner');

var noble = require('noble');
var uriDecode = require('uri-beacon-uri-encoding').decode;

var SERVICE_UUID = 'feaa';

var UriBeaconScanner = function() {
  noble.on('discover', this.onDiscover.bind(this));
};

util.inherits(UriBeaconScanner, events.EventEmitter);

UriBeaconScanner.prototype.startScanning = function(allowDuplicates) {
  debug('startScanning');

  var startScanningOnPowerOn = function() {
    if (noble.state === 'poweredOn') {
      noble.startScanning([SERVICE_UUID], allowDuplicates);
    } else {
      noble.once('stateChange', startScanningOnPowerOn);
    }
  };

  startScanningOnPowerOn();
};

UriBeaconScanner.prototype.stopScanning = function() {
  debug('stopScanning');
  noble.stopScanning();
};

UriBeaconScanner.prototype.onDiscover = function(peripheral) {
  debug('onDiscover: %s', peripheral);

  if (this.isUriBeacon(peripheral)) {
    var uriBeacon = this.parseUriBeacon(peripheral);

    debug('onDiscover: uriBeacon = %s', JSON.stringify(uriBeacon));
    this.emit('discover', uriBeacon);
  }
};

UriBeaconScanner.prototype.isUriBeacon = function(peripheral) {
  var serviceData = peripheral.advertisement.serviceData;

  // make sure service data is present, with the expected uuid and data length
  return ( serviceData &&
           serviceData.length > 0 &&
           serviceData[0].uuid === SERVICE_UUID &&
           serviceData[0].data.length > 2
         );
};

UriBeaconScanner.prototype.parseUriBeacon = function(peripheral) {
  var data = peripheral.advertisement.serviceData[0].data;

  return {
    flags: data.readUInt8(0),
    txPower: data.readInt8(1),
    uri: uriDecode(data.slice(2)),
    rssi: peripheral.rssi
  };
};

module.exports = UriBeaconScanner;
