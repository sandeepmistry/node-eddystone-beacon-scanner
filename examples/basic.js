var EddystoneBeaconScanner = require('../'); // use require('eddystone-beacon-scanner'), if installed from npm

EddystoneBeaconScanner.on('found', function(beacon) {
  console.log('found Eddystone Beacon:\n', JSON.stringify(beacon, null, 2));
});

EddystoneBeaconScanner.on('updated', function(beacon) {
  console.log('updated Eddystone Beacon:\n', JSON.stringify(beacon, null, 2));
});

EddystoneBeaconScanner.on('lost', function(beacon) {
  console.log('lost Eddystone beacon:\n', JSON.stringify(beacon, null, 2));
});

EddystoneBeaconScanner.startScanning(true);
