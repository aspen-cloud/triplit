#!/bin/bash

# Extract the version
VERSION=$(node -p "require('./package.json').version")

# Build and tag the Docker image
docker build -t aspencloud/triplit-server:$VERSION .
docker tag aspencloud/triplit-server:$VERSION aspencloud/triplit-server:latest