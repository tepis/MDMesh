# Control-plane image: build the WAR (Maven, JDK 17), drop it into Tomcat 9.
# Runtime config (DB, base.url, secrets) is generated from environment by entrypoint.sh, so the
# same image serves any deployment. JDK 17 is required — dependencies (e.g. activemq-broker) ship
# Java-11+ bytecode, so Java 8 fails to both compile and run.

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY pom.xml ./
COPY common ./common
COPY jwt ./jwt
COPY notification ./notification
COPY plugins ./plugins
COPY server ./server
COPY install ./install
RUN cp server/build.properties.example server/build.properties || true
RUN mvn -q -B -DskipTests package

FROM tomcat:9.0-jdk17-temurin
RUN rm -rf /usr/local/tomcat/webapps/*
COPY --from=build /src/server/target/launcher.war /usr/local/tomcat/webapps/ROOT.war
# App base directory (data, plugins, email templates). /opt/mdmesh should be a volume
# so uploaded files + the hosted agent APK survive container recreation.
RUN mkdir -p /opt/mdmesh/files /opt/mdmesh/plugins \
 && groupadd -r mdmesh && useradd -r -g mdmesh -d /opt/mdmesh -s /usr/sbin/nologin mdmesh
# Tomcat drops a connection whose read or write makes no progress for connectionTimeout (20 s in the stock image),
# which cuts a large APK mid-file when a device downloads it slowly (Caddy holds back while the client catches up).
# Caddy is the only peer, so allow 5 minutes; idle keep-alive stays at 20 s. The grep fails the build if the stock
# connector line changes.
RUN sed -i 's/connectionTimeout="20000"/connectionTimeout="300000" keepAliveTimeout="20000"/' /usr/local/tomcat/conf/server.xml \
 && grep -q 'connectionTimeout="300000"' /usr/local/tomcat/conf/server.xml
COPY install/emails /opt/mdmesh/emails
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# NOTE: full uploaded-APK metadata parsing uses `aapt`; install android build-tools aapt into the
# image for the richest parse (the Java apk-parser fallback covers basic package/version otherwise).
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
