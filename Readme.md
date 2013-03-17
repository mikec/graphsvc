# graphsvc

A graph web service development framework for [node.js](http://nodejs.org) and [neo4j](http://neo4j.org)

## Installation

	$ npm install graphsvc
	
You will also need to run an instance of the [neo4j](http://neo4j.org) graph database.

## Quick Start

graphsvc lets you develop graph web services on top of [neo4j](neo4j.org).  It extends the [express](http://expressjs.com) framework.  Here's a simple example:

Configure the service

```js
//myservice.js

graphsvc = require('graphsvc');
var svc = graphsvc("http://localhost:7474");

svc.endpoint("person").endpoint("place").endpoint("thing");

svc.listen("3000");
```

Run the service

```console
$ node myservice.js
```

Post some data to the service

```console
$ curl -X POST 'http://localhost:3000/places' -d '{"name":"krunkville", "state":"minnesota"}' -H 'Content-Type: application/json'
{ "key": "1395", "url": "http://localhost:3000/places/1395" }
```
	
Get the data back from the service

```console
$ curl -X GET 'http://localhost:3000/places/1395'
{ "id": "1395", "name": "krunkville", "state": "minnesota" }
```

## How to use it

graphsvc allows you to create service endpoints that represent entities (*person*, *place*, *widget*, etc), and service endpoints that represent connections between entities (*person.friends*, *place.visitors*, *widget.parts*).

After configuring endpoints, you can send POST, PUT, GET, or DELETE requests to them to add, modify, read, or delete data. 

### Configuring an Entity Endpoint

Entity endpoints are configured using **.endpoint()**

```js
svc.endpoint('person');
```

Entity endpoint names are pluralized by default, so the endpoint in this case would be

```console
http://localhost:3000/persons
```

To override pluralization, include a *collectionName* value in configuration options

```js
svc.endpoint('person', {'collectionName': 'people'});
```

Data added to entity endpoints is indexed by a key property.  The default key property is *id*.  To override this, include a *key* value in configuration options

```js
svc.endpoint('person', {'key': 'name'});
```

### POST to an Entity Endpoint

Issuing a POST request to an entity endpoint will create a new entity.  If a value for the *key* property is not supplied in your POST data, the *key* value will be auto-generated.

```console
## Example 1: add '{"name: "mike", "status": "awesome"}' to a /people endpoint with the key 'name'

$ curl -X POST 'http://localhost:3000/people' -d '{"name": "mike", "status": "awesome"}' -H 'Content-Type: application/json'
{ "key": "mike", "url": "http://localhost:3000/people/mike" }


## Example 2: add '{"name": "mike"}' to a /people endpoint with the default key.  
##            the 12345 in the response represents the auto-generated key value.

$ curl -X POST 'http://localhost:3000/people' -d '{"name": "mike"}' -H 'Content-Type: application/json'
{ "key": "12345", "url": "http://localhost:3000/people/12345" }
```


### GET to an Entity Endpoint

Issuing a GET request to an entity endpoint gets an entity.  GET requests must be issued to */[endpoint]/[key_value]*

```console
## Example: Get an entity with a key value of 'mike' from the /people endpoint.

$ curl -X GET 'http://localhost:3000/people/mike'
{ "name": "mike", "status": "awesome" }
```

### PUT to an Entity Endpoint

Issuing a PUT request to an entity endpoint will modify an entity.  Entity properties can be added, modified, or deleted.

```console
## Add an *age* property to an entity
$ curl -X PUT 'http://localhost:3000/people/mike' -d '{"age", "63"}' -H 'Content-Type: application/json'

## Modify the *age* property
$ curl -X PUT 'http://localhost:3000/people/mike' -d '{"age", "29"}' -H 'Content-Type: application/json'

## Delete the *age* property
$ curl -X PUT 'http://localhost:3000/people/mike' -d '{"age", null}' -H 'Content-Type: application/json'
```

### DELETE to an Entity Endpoint

Issuing a DELETE request to an entity endpoint will delete the entity.

```console
## Delete an entity
$ curl -X DELETE 'http://localhost:3000/people/mike'
```

### Configuring a Connection Endpoint

Connection endpoints are configured using **.endpoint()**


