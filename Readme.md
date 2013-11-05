Graphsvc
========

Graphsvc makes it super easy to create an API for consuming and modifying your graph data. It runs on [node.js](http://nodejs.org) and extends the [express](http://expressjs.com) framework. It uses [neo4j](http://neo4j.org) as a datasource.


Installation
------------

	$ npm install graphsvc
	
You will also need to run an instance of [neo4j](http://neo4j.org).


Overview
--------

Imagine that we want to build a simple service that lets us create, update, or delete instances of two entity types: `users` and `places`. Additionally, we want the ability to create, update, or delete connections between these instances.

Graphsvc allows us to configure such a service with just a few lines of code. Here's what it would look like:

	graphsvc = require('graphsvc');

	var app = graphsvc('http://neo4j.myservice.com');
	app.endpoint('user')
	   .endpoint('place')
	   .endpoint('user.destinations', 'place.visitors', 'visited');

	app.listen(8080);

If we run this code on node.js, then our service will be listening on port 8080.


### Simple Configuration

Let's go through the configuration above step by step:


	graphsvc = require('graphsvc');

This imports the graphsvc module that we installed via [npm](https://npmjs.org/).


	var app = graphsvc("http://neo4j.myservice.com");

This creates an instance of graphsvc that points to our neo4j REST API endpoint. If we're running locally, this would be 'http://localhost:7474' by default.


 	app.endpoint('user');

This configures the `user` endpoint. A new endpoint: `http://myservice/users` will be created (note the automatic pluralization).

We can POST request to this endpoint to create new users. We can read or update existing users by sending GET requests to: `http://myservice/users/[user_id]`


	app.endpoint('place');

This configures the `place` endpoint, which works exactly the same as the `user` endpoint described above.


	app.endpoint('user.destinations', 'place.visitors', 'visited');

This configures a connection between users and places. The first parameter, `user.destinations`, creates the endpoint `http://myservice/users/[user_id]/destinations`. We can read the list of places that a user has visited by sending a GET request to this endpoint. We can connect the user to a new or existing place by sending a POST request to this endpoint.

The second parameter, `place.visitors`, creates the endpoint `http://myservice/places/[place_id]/visitors`. This works exactly the same as the `user.destinations` endpoint, only in reverse. Sending a GET request to it will let us read a list of users who have visited a given place, and sending a POST request to it lets us connect new or existing users to this place.

The third parameter, `visited`, is the name of the neo4j relationship type for this connection. It describes the relationship, as in *[user]* visited *[place]*. For instance, *Mike* visited *Boston*.


	app.listen(8000);

This configures our service to listen on port 8080. Note that because graphsvc is an extension of [express](http://expressjs.com), all of the functions provided by express (such as `listen`) will be available from the `app` object.


### Controlling Requests and Responses

If we need to add additional logic to our service, we can use the `before` and `after` functions to intercept requests or responses for specific entities or connections. 

Here are a few examples:


	app.before('create', 'place', function(data, request, next) {
		if(data.name == 'Newfoundland') {
			throw new Error('That place is too cold');
		} else {
			next();
		}
	});

This rule would prevent any place named *Newfoundland* from being created, and would respond with an error.


	app.after('read', 'user', function(data, request, next) {
		if(data.name == 'Mike') {
			data
		}
		next();
	});







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



