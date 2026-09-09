FROM  --platform=${BUILDPLATFORM} ubuntu:22.04 AS base
USER root

RUN apt-get update -y

RUN apt-get install git sudo -y
RUN apt-get update && apt-get install --no-install-recommends -y \
  g++ \
  git \
  python3-pip \
  python-is-python3 \
  libxml2-dev \
  libxslt-dev \
  && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN git clone --recurse-submodules https://github.com/ArduPilot/ardupilot.git --depth 1

WORKDIR /ardupilot

USER root
RUN pip3 install future lxml pymavlink MAVProxy pexpect flake8==3.7.9 requests==2.27.1 monotonic==1.6 geocoder empy==3.3.4 configparser==4.0.2 click==7.1.2 decorator==4.4.2 dronecan pygame intelhex empy
RUN ./waf configure --board sitl
RUN ./waf copter
RUN ./waf plane

EXPOSE 5760/tcp
EXPOSE 5762/tcp
EXPOSE 5763/tcp

RUN mkdir -p /ardupilot_cache
VOLUME ["/ardupilot_cache"]

WORKDIR /

ADD sitl_setup sitl_setup

WORKDIR /sitl_setup

RUN chmod +x run.sh

HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=240 CMD test -f /tmp/fgcs_done || exit 1

# ENTRYPOINT python ./Tools/autotest/sim_vehicle.py -v ArduCopter --custom-location=${LAT},${LON},${ALT},${DIR} --no-mavproxy
ENTRYPOINT [ "./run.sh" ]
