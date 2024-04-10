#!/bin/bash

# Extract the version
VERSION=$(node -p "require('./package.json').version")

# Build and tag the Docker image
docker build -t aspencloud/triplit-db:$VERSION .
docker tag aspencloud/triplit-db:$VERSION aspencloud/triplit-db:latest