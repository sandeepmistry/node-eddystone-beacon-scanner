var EddystoneBeaconScanner = require('../'); // use require('eddystone-beacon-scanner'), if installed from npm

EddystoneBeaconScanner.on('discover', function(urlBeacon) {
  console.log('discovered Eddystone beacon:');
  console.log('  url      = ' + urlBeacon.url);
  console.log('  type     = ' + urlBeacon.type);
  console.log('  TX power = ' + urlBeacon.txPower);
  console.log('  RSSI     = ' + urlBeacon.rssi);
  console.log();
});

EddystoneBeaconScanner.startScanning();
