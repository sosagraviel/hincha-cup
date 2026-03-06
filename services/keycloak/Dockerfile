FROM quay.io/keycloak/keycloak:26.1.3

USER root

COPY ./themes /opt/keycloak/themes

COPY *.json ./
COPY ./src ./src

USER 1000

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--http-port=7080", "--https-port=-1", "--http-enabled=true", "--health-enabled=true"]