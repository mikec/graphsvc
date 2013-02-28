# graphsvc

A graph web service development framework for node.js and neo4j.

## Installation

	$ npm install graphsvc
	
	You will also need to run an instance of the [neo4j](http://neo4j.org) graph database.

## Nutshell

Configure the service

```js
//myservice.js

graphsvc = require('graphsvc');
var svc = graphsvc("http://localhost:7474");

svc.addEntity("person").addEntity("place").addEntity("thing");

svc.listen("3000");
```

Run the service

	$ node myservice.js

Post data

	$ curl -H 'Content-Type: application/json' -X POST 'http://localhost:3000/places' -d '{"name":"krunkville", "state":"minnesota"}'
	
	==> { "key": "1395", "url": "http://localhost:3000/places/1395" }
	
Get data

	http://localhost:3000/places/1395
	
	==> {
	==>		"id": "1395",
	==>		"name": "krunkville",
	==>		"state": "minnesota"
	==> }

## Features

  * Extends the [Express](http://github.com/visionmedia/express) framework
  * Simple service endpoint configuration
  * Automatic neo4j index creation
  *