const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const globalStore = require('zigbee-herdsman-converters/lib/store');
const tuya = require('zigbee-herdsman-converters/lib/tuya');
const utils = require('zigbee-herdsman-converters/lib/utils');
const e = exposes.presets;
const ea = exposes.access;


/*
reversesd engineered DP's from Tuya:
====================================

1 - Switch
2 - Regulating water volume
3 - Flow state
10 - Weather Delay
11 - Irrigation time

101 - 倒计时剩余时间  countdown time remaining
102 - 倒计时剩余时间设置 countdown remaining time setting
103 - 开到底状态 open to the end
104 - 故障告警 fault alarm
105 - 默认倒计时开启 by default countdown is on
106 - 默认倒计时设置 default countdown settings
107 - 月使用时长 monthly usage time
108 - 月使用水容量 monthly water capacity
109 - 定时灌溉 regular irrigation
110 - 电池电量 battery power

Tuya developer GUI sends:
=========================

switch | Boolean | "{true,false}"
percent_control | Integer | {   "unit": "%",   "min": 0,   "max": 100,   "scale": 0,   "step": 5 }
weather_delay | Enum | {   "range": [     "cancel",     "24h",     "48h",     "72h"   ] }
countdown | Integer | {   "unit": "s",   "min": 0,   "max": 86400,   "scale": 0,   "step": 1
*/

const tuyaLocal = {
    dataPoints: {

        // DP guessed based on Tuya and 
        valve_state_auto_shutdown: 2,
        water_flow: 3,

        shutdown_timer: 11,
        remaining_watering_time: 101,
        valve_state: 102,
        
        last_watering_time: 107,
        battery: 110,

        // DP received but not usefull for HA
        //error :104
        //max_min :108
    },
};


const fzLocal = {
    watering_timer: {
        cluster: 'manuSpecificTuya',
        type: ['commandDataReport'],
        convert: (model, msg, publish, options, meta) => {

            const result = {};
            for (const dpValue of msg.data.dpValues) {
                const dp = dpValue.dp; // First we get the data point ID
                const value = tuya.getDataValue(dpValue); // This function will take care of converting the data to proper JS type
                switch (dp) {
                    case tuyaLocal.dataPoints.water_flow: {
                        result.water_flow = value;
                        break;
                    }
                    case tuyaLocal.dataPoints.remaining_watering_time: {
                        result.remaining_watering_time = value;
                        break;
                    }
                    case tuyaLocal.dataPoints.last_watering_time: {
                        result.last_watering_time = value;
                        break;
                    }

                    case tuyaLocal.dataPoints.valve_state: {
                        result.valve_state = value;
                        break;
                    }

                    case tuyaLocal.dataPoints.shutdown_timer: {
                        result.shutdown_timer = value;
                        break;
                    }
                    case tuyaLocal.dataPoints.valve_state_auto_shutdown: {
                        result.valve_state_auto_shutdown = value;
                        result.valve_state = value;
                        break;
                    }

                    case tuyaLocal.dataPoints.battery: {
                        result.battery = value;
                        break;
                    }
                    default: {
                        meta.logger.debug(`>>> UNKNOWN DP #${dp} with data "${JSON.stringify(dpValue)}"`);
                    }
                }
            }
            return result;
        },
    },
};

const tzLocal = {
    valve_state: {
        key: ['valve_state'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.valve_state, value);
        },
    },      
    shutdown_timer: {
        key: ['shutdown_timer'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.shutdown_timer, value);

        },
    },      
    valve_state_auto_shutdown: {
        key: ['valve_state_auto_shutdown'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, tuyaLocal.dataPoints.valve_state_auto_shutdown, value);
        },
    },   
    
};

const definition = {
    fingerprint: [{modelID: 'TS0601', manufacturerName: '_TZE200_arge1ptm'}],
    model: 'QT-05M',
    vendor: 'QOTO',
    description: 'Solar power garden waterering timer',
    fromZigbee: [fz.ignore_basic_report, fz.ignore_tuya_set_time, fz.ignore_onoff_report, fzLocal.watering_timer],
    toZigbee: [
        tzLocal.valve_state,
        tzLocal.shutdown_timer,
        tzLocal.valve_state_auto_shutdown,
    ],
    configure: async (device, coordinatorEndpoint, logger) => {
        //const endpoint = device.getEndpoint(1);
        //await reporting.bind(endpoint, coordinatorEndpoint, ['genBasic']);
    },
    exposes: [
        
        exposes.numeric('water_flow', ea.STATE).withUnit('%').withValueMin(0).withDescription('Current water flow in %.'),
        exposes.numeric('last_watering_time', ea.STATE).withUnit('sec').withValueMin(0).withDescription('Duration of the last watering in seconds.'),
        exposes.numeric('remaining_watering_time', ea.STATE).withUnit('sec').withValueMin(0).withDescription('Remaning watering time (for auto shutdown). Updates every minute, and every 10s in the last minute.'),

        exposes.numeric('valve_state', ea.STATE_SET).withValueMin(0).withValueMax(100).withValueStep(5).withUnit('%').withDescription('Set valve to %.'),

        exposes.numeric('shutdown_timer', ea.STATE_SET).withValueMin(0).withValueMax(14400).withUnit('sec').withDescription('Auto shutdown in seconds.'),
        exposes.numeric('valve_state_auto_shutdown', ea.STATE_SET).withValueMin(0).withValueMax(100).withValueStep(5).withUnit('%').withDescription('Set valve to % with auto shutdown.'),
                
        e.battery(),        
    ]
};

module.exports = definition;


