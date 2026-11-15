import {
    ROFL_MAX_CONCURRENT,
    ROFL_USER_CONCURRENT,
    ROFL_USER_REQUEST_LIMIT,
    ROFL_RATE_WINDOW_MS,
    ROFL_BODY_TIMEOUT_MS,
    ROFL_PARSE_TIMEOUT_MS
} from '$app/env/private';
import { RoflAdmission, roflLimits } from './processing.ts';

export const uploadLimits = roflLimits({
    ROFL_MAX_CONCURRENT,
    ROFL_USER_CONCURRENT,
    ROFL_USER_REQUEST_LIMIT,
    ROFL_RATE_WINDOW_MS,
    ROFL_BODY_TIMEOUT_MS,
    ROFL_PARSE_TIMEOUT_MS
});
export const uploadAdmission = new RoflAdmission(uploadLimits);
