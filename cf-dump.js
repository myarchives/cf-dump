#!/usr/bin/env node

const MAX_ZONES_PER_PAGE = 50;
const URL = "api.cloudflare.com";
const CSV_FIELD_DELIMITER = ",";

const args = process.argv.slice(2);
if(args.length < 2 ){
	process.stderr.write("Missing arguments\n\n");
	process.stderr.write("Usage:  ./cf-dump.js <email> <api key> [field delimiter]\n")
	process.stderr.write("Example: ./cf-dump.js email@example.com 2d020di24n2j2kd9di2j2eh82ndwdfdssi2ei ;\n\n")
	process.exit(3);
}

var EMAIL = args[0];
var APIKEY = args[1];

var https = require('https');

var httpsGet = function(opts, cb){
	var myStack = [];

	https.request(opts, function(res) {
	  res.setEncoding('utf8');
	  res.on('data', function (chunk) {

	  	myStack.push(chunk);
			var t = myStack.join('');
			//when object is well-formed, i.e. last chunk, callback
			try{
				var x = JSON.parse(t);

				cb(x);
			}catch(e){ }

	  });
	}).end();
}

var getAllZonesOptions = function(pageNo){
	return {
	  host: URL, port: 443, method: 'GET',
	  path: '/client/v4/zones?&status=active&match=all&per_page='+MAX_ZONES_PER_PAGE+'&page='+pageNo,
	  headers:{ 'X-Auth-Email': EMAIL, 'X-Auth-Key': APIKEY }
	};
}

var getZoneOptions = function(zoneId){
	var toD = new Date();
	var fromD = new Date();
	fromD.setFullYear(fromD.getFullYear() -1 );
	fromD.setDate(fromD.getDate() +2 );
	toD.setDate(toD.getDate() -1 );

	return {
	  host: URL, port: 443, method: 'GET',
	  path: '/client/v4/zones/' + zoneId + '/analytics/dashboard?since='+fromD.toISOString()+'&until='+toD.toISOString()+'&continuous=true',
	  headers:{ 'X-Auth-Email': EMAIL,  'X-Auth-Key': APIKEY }
	};
}

//extract only usefull info from zones
var clearAllZones = function(sd){
	return sd.result.map(function(el){
		return {
			id: el.id,
			name: el.name
		};
	});
}

//print zone analytics
var completedZone = function(zone, analytics){
	analytics.result.timeseries.forEach(function(ts){

		var row = "";

		row += zone.name;
		row += CSV_FIELD_DELIMITER;
		row += ts.since;
		row += CSV_FIELD_DELIMITER;
		row += ts.until;
		row += CSV_FIELD_DELIMITER;
		row += ts.requests.all;
		row += CSV_FIELD_DELIMITER;
		row += ts.requests.cached;
		row += CSV_FIELD_DELIMITER;
		row += ts.requests.uncached;
		row += CSV_FIELD_DELIMITER;
		row += ts.bandwidth.all;
		row += CSV_FIELD_DELIMITER;
		row += ts.bandwidth.cached;
		row += CSV_FIELD_DELIMITER;
		row += ts.bandwidth.uncached;

		console.log(row);
	});
}

//get all zones (recursive on pageIndex, get all pages)
var getAllZones = function(pageIndex, prevZones, cb){
	process.stderr.write("Downloading zones list: page " + pageIndex + " (already downloaded " + prevZones.length +" zones)\n" );
	httpsGet(getAllZonesOptions(pageIndex), function(o){
		if(!o.success){
			process.stderr.write("Error during fetching zones\n");
			process.stderr.write( JSON.strinfigy(o.errors) +'\n' );
			process.exit(1);
		}

		var zones = clearAllZones(o);
		var allZones = prevZones.concat(zones);

		if(zones.length==50){
			getAllZones(pageIndex+1, allZones, cb);
		}else{
			process.stderr.write("Zones list download completed. Downloaded " + allZones.length + " zones\n\n" );
			cb(allZones);
		}
	});
}

//get one zone. recursive and call getZone on other zones of array
var getZone = function(zones, index, cb){
	var z = zones[index];
	process.stderr.write('Downloading statistics for zone  ' + (index+1) + '/' + zones.length +  ' - ' + z.id + ' - ' + z.name + '\n');
		httpsGet(getZoneOptions(z.id), function(o){

			if(!o.success){
				process.stderr.write("Error during fetching zone" + z.id + " - " + z.name + "\n");
				process.stderr.write( JSON.stringify(o.errors) + '\n');
				process.exit(2);
			}

			completedZone(z,o);

			if(index==zones.length-1){
				cb();
			}else{
				getZone(zones,index+1,cb);
			}

		});
}

getAllZones(1,[], function(zones){
	console.log("domain,since,until,req_all,req_cache,req_nocache,bw_all,bw_cache,bw_nocache");
	getZone(zones,0,function(){
		process.stderr.write('\n');
		process.stderr.write('cf-dump completed.\n');
	});
});

