#!/bin/bash

# Extract the version
VERSION=$(node -p "require('./package.json').version")

# Build and tag the Docker image
# Specify platforms: https://docs.docker.com/build/building/multi-platform/#building-multi-platform-images
docker buildx build -t aspencloud/triplit-server:$VERSION --platform linux/amd64,linux/arm64 .
docker tag aspencloud/triplit-server:$VERSION aspencloud/triplit-server:latest