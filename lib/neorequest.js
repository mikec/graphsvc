var superagent = require('superagent')
  , Q = require('q');

var neorequest = exports = module.exports = NeoRequest;

//POST to neo4j http service
exports.post = function(url, data) {
	var deferred = Q.defer();
	superagent
   .post(url)
   .set('Accept', 'application/json')
   .set('X-Stream', 'true')
   .send(data)
   .end(function(r){
	 if (r.ok) {
		deferred.resolve(r);
	 } else {
		deferred.reject(new Error(r.text));
	 }
   })
   .on('error', function(err) {
		deferred.reject(new Error(err));
   });
   return deferred.promise;
}

//PUT to neo4j http service
exports.put = function(url, data) {
	var deferred = Q.defer();
	superagent
   .put(url)
   .set('Accept', 'application/json')
   .set('X-Stream', 'true')
   .send(data)
   .end(function(r){
	 if (r.ok) {
		deferred.resolve(r);
	 } else {
		deferred.reject(new Error(r.text));
	 }
   })
   .on('error', function(err) {
		deferred.reject(new Error(err));
   });
   return deferred.promise;
}

//DELETE to neo4j http service
exports.del = function(url) {
	var deferred = Q.defer();
	superagent
   .del(url)
   .set('Accept', 'application/json')
   .set('X-Stream', 'true')
   .end(function(r){
	 if (r.ok) {
		deferred.resolve(r);
	 } else {
		deferred.reject(new Error(r.text));
	 }
   })
   .on('error', function(err) {
		deferred.reject(new Error(err));
   });
   return deferred.promise;
}

//GET to neo4j http service
exports.get = function(url) {
	var deferred = Q.defer();
	superagent
   .get(url)
   .set('Accept', 'application/json')
   .set('X-Stream', 'true')
   .end(function(r){
	 if (r.ok) {
		deferred.resolve(r);
	 } else {
		deferred.reject(new Error(r.text));
	 }
   })
   .on('error', function(err) {
		deferred.reject(new Error(err));
   });
   return deferred.promise;
}

function NeoRequest() {
	this.batchRequests = [];
}
NeoRequest.prototype.addBatchRequest = function(method, url, data) {
	var nextId = this.batchRequests.length;
	var reqData = {
		"method": method,
		"to": url,
		"id": nextId
	}
	if(data) reqData.body = data;
	this.batchRequests.push(reqData);
}
NeoRequest.prototype.executeBatchRequests = function(url) {
	return neorequest.post(url, this.batchRequests);
}