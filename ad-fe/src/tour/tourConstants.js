export const TOUR_STATUS = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    FINISHED: 'finished',
    SKIPPED: 'skipped',
    ERROR: 'error'
};

export const TOUR_EVENTS = {
    TOUR_START: 'tour:start',
    TOUR_END: 'tour:end',
    TOUR_PAUSE: 'tour:pause',
    TOUR_RESUME: 'tour:resume',
    STEP_CHANGE: 'step:change',
    CHILD_START: 'child:start',
    CHILD_END: 'child:end',
};
