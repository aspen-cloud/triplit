# Setup environment
FROM debian:bullseye as builder

ARG NODE_VERSION=16.19.0

RUN apt-get update; apt install -y curl
RUN curl https://get.volta.sh | bash
ENV VOLTA_HOME /root/.volta
ENV PATH /root/.volta/bin:$PATH
RUN volta install node@${NODE_VERSION}
RUN volta install yarn@3.4.1

#######################################################################

RUN mkdir /app
WORKDIR /app

ENV NODE_ENV production

# Copy workspace depenedencies
COPY ../../packages/db ./packages/db

# Copy main app
COPY ../../packages/server ./packages/server

# Copy root files
COPY ../../package.json .
COPY ../../yarn.lock .
COPY ../../tsconfig.json .
COPY ../../.yarnrc.yml .
COPY ../../.yarn .yarn

RUN yarn install

LABEL fly_launch_runtime="nodejs"

WORKDIR /app/packages/server
CMD [ "yarn", "start" ]
