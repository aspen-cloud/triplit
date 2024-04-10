#!/bin/bash

# Extract the version
VERSION=$(node -p "require('./package.json').version")

# Push the tags to Docker Hub
docker push aspencloud/triplit-db:$VERSION
docker push aspencloud/triplit-db:latest