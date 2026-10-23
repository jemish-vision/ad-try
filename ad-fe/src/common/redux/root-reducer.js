import { combineReducers } from 'redux'
import usersReducer from './reducer'
import superAdminReducer from './superAdminReducer';

const rootReducer = combineReducers({
    data: usersReducer,
    superData: superAdminReducer
})

export default rootReducer;