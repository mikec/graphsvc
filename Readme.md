# graphsvc

A graph web service development framework for node.js and neo4j.

'''js
graphsvc = require('graphsvc');
var svc = graphsvc("http://localhost:7474");

svc.addEntity("person").addEntity("place").addEntity("thing");

svc.listen("3000");
'''

## Installation

$ npm install graphsvc

You will also need to run an instance of the [neo4j](http://neo4j.org) graph database.

## Features

	* Extends [Express](http://github.com/visionmedia/express)
	* Is awesome