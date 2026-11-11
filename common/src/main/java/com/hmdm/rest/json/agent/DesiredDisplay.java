/*
 * MDMesh: fork of Headwind MDM. Apache-2.0.
 */
package com.hmdm.rest.json.agent;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;
import lombok.Setter;

/**
 * Display section of {@link DesiredConfig}: the screen brightness the agent sets as Device Owner. {@code autoBrightness}
 * true = adaptive brightness; false = manual, at {@code brightness} (0-255) when it is set. Older agents ignore it.
 */
@Getter
@Setter
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public class DesiredDisplay {
    private Boolean autoBrightness;
    private Integer brightness;
}
