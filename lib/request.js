var superagent = require('superagent')
  , Q = require('q');

exports = module.exports = Request;

function Request(baseUrl) {
	this.baseUrl = addTrailingSlash(baseUrl);
}
Request.prototype.get = function(url) {
	return Request.get(this.baseUrl + url);
}
Request.prototype.post = function(url, data) {
	return Request.post(this.baseUrl + url, data);
}
Request.prototype.put = function(url, data) {
	return Request.put(this.baseUrl + url, data);
}
Request.prototype.del = function(url) {
	return Request.del(this.baseUrl + url);
}

//GET request
exports.get = function(url) {
	var deferred = Q.defer();
	superagent
   .get(url)
   .set('Accept', 'application/json')
   .set('X-Stream', 'true')
   .end(function(r) {
		if (r && r.ok) {
			if(r.body && r.body.error) {
				deferred.reject(r.body);
			} else {
				deferred.resolve(r);
			}
		} else {
			deferred.reject(new Error(r.text));
		}
	})
   .on('error', function(err) {
		deferred.reject(err);
   });
   return deferred.promise;
}

//POST request
exports.post = function(url, data) {
	var deferred = Q.defer();
	superagent
   .post(url)
   .set('Accept', 'application/json')
   .set('X-Stream', 'true')
   .send(data)
   .end(function(r) {
		if (r && r.ok) {
			if(r.body && r.body.error) {
				deferred.reject(r.body);
			} else {
				deferred.resolve(r);
			}
		} else {
			deferred.reject(new Error(r.text));
		}
	})
   .on('error', function(err) {
		deferred.reject(err);
   });
   return deferred.promise;
}

//PUT request
exports.put = function(url, data) {
	var deferred = Q.defer();
	superagent
   .put(url)
   .set('Accept', 'application/json')
   .set('X-Stream', 'true')
   .send(data)
   .end(function(r) {
		if (r && r.ok) {
			if(r.body && r.body.error) {
				deferred.reject(r.body);
			} else {
				deferred.resolve(r);
			}
		} else {
			deferred.reject(new Error(r.text));
		}
	})
   .on('error', function(err) {
		deferred.reject(err);
   });
   return deferred.promise;
}

//DELETE request
exports.del = function(url) {
	var deferred = Q.defer();
	superagent
   .del(url)
   .set('Accept', 'application/json')
   .set('X-Stream', 'true')
   .end(function(r) {
		if (r && r.ok) {
			if(r.body && r.body.error) {
				deferred.reject(r.body);
			} else {
				deferred.resolve(r);
			}
		} else {
			deferred.reject(new Error(r.text));
		}
	})
   .on('error', function(err) {
		deferred.reject(err);
   });
   return deferred.promise;
}



function addTrailingSlash(baseUrl) {
	var lastChar = baseUrl.substr(baseUrl.length - 1, 1);
	if(lastChar != '/') baseUrl += '/';
	return baseUrl;
}