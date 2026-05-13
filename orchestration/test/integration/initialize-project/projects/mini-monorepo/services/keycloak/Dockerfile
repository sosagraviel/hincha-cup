# syntax=docker/dockerfile:1.6
FROM quay.io/keycloak/keycloak:25.0 AS builder
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:25.0 AS runtime
COPY --from=builder /opt/keycloak/ /opt/keycloak/
COPY realm-export.json /opt/keycloak/data/import/
COPY themes/ /opt/keycloak/themes/
EXPOSE 8080
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
