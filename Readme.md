graphsvc
========

graphsvc makes it easy to build graph services. It runs on [node.js](http://nodejs.org) and extends the [express](http://expressjs.com) framework. It uses [neo4j](http://neo4j.org) on the backend.


Installation
------------

	$ npm install graphsvc
	
You will also need to run an instance of [neo4j](http://neo4j.org).


Overview
--------

graphsvc works by letting you configure service endpoints. Each endpoint represents either an *entity* or a *connection* between entities.

## Entity Endpoints

Here's a simple service with 3 entity endpoints

	graphsvc = require('graphsvc');
	var app = graphsvc("http://neo4j.myservice.com");

	app.endpoint("user")
	   .endpoint("place")
	   .endpoint("thing");

	app.listen("80");

This will automatically configure these endpoints (assuming our service is running on `http://myservice.com`)

* `http://myservice.com/users`
* `http://myservice.com/places`
* `http://myservice.com/things`

We can use these endpoints to create, update, delete, or get entities. We can create a new user

	$ curl -X POST 'http://myservice.com/users' 
	       -d '{"name":"Mike", "state":"Massachusetts"}' 
	       -H 'Content-Type: application/json'

The server will respond with the key of the newly created user. Assuming the key was `12345`, we can get the user

	$ curl -X GET 'http://myservice.com/users/12345'

We can also modify the user

	$ curl -X POST 'http://myservice.com/users/12345' 
	       -d '{"state":"Connecticut"}' 
	       -H 'Content-Type: application/json'

or delete the user

	$ curl -X DELETE 'http://myservice.com/users/12345'


## Connection Endpoints

Here's the same service as above, with some connection endpoints added

	graphsvc = require('graphsvc');
	var app = graphsvc("http://neo4j.myservice.com");

	app.endpoint("user")
	   .endpoint("place")
	   .endpoint("thing");
	   .endpoint("user.locations", "place.dwellers", "lives_in")
	   .endpoint("user.items", "thing.owners", "owns");

	app.listen("80");

This will configure 2 endpoints for the *lives_in* connection

* `http://myservice.com/users/[user_key]/locations`
* `http://myservice.com/places/[place_key]/dwellers`

and 2 endpoints for the *owns* connection

* `http://myservice.com/users/[user_key]/items`
* `http://myservice.com/things/[thing_key]/owners`

Assuming that user 12345 and place 6789 exist, we can now connect them

	$ curl -X POST 'http://myservice.com/users/12345/locations' 
		   -d '{"id":"6789"}' 
		   -H 'Content-Type: application/json'

We can now get all places that user 12345 lives in. The server would respond to this with place 6789, and any other connected places

	$ curl -X GET 'http://myservice.com/users/12345/locations'



