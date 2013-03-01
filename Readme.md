# graphsvc

A graph web service development framework for [node.js](nodejs.org) and [neo4j](neo4j.org)

## Installation

	$ npm install graphsvc
	
You will also need to run an instance of the [neo4j](http://neo4j.org) graph database.

## Quick Start

graphsvc lets you develop graph web services on top of [neo4j](neo4j.org).  It extends the [express](http://expressjs.com) framework.  Here's a simple example.

1. Configure the service

```js
//myservice.js

graphsvc = require('graphsvc');
var svc = graphsvc("http://localhost:7474");

svc.endpoint("person").endpoint("place").endpoint("thing");

svc.listen("3000");
```

2. Run the service

	$ node myservice.js

3. Post some data to the service

```console
$ curl -H 'Content-Type: application/json' 
	   -X POST 'http://localhost:3000/places' 
	   -d '{"name":"krunkville", "state":"minnesota"}'

### => { "key": "1395", "url": "http://localhost:3000/places/1395" }
```
	
4. Get the data back from the service

```console
http://localhost:3000/places/1395

### => { "id": "1395", "name": "krunkville", "state": "minnesota" }
```

## Guide

### Sub Item 1

asdflkjsdflkjj

### Sub Item 2

asddfasdffsadf
