import * as types from './actionType'
const istate = {
    loader: false,
    profileInfo: '',
    connected:false,

}

const usersReducer = (state = istate, action) => {
    switch (action.type) {
        case types.GET_LOADER:
            return { ...state, loader: action.value }
        case 'PROFILE_INFO':
            return {
                ...state,
                profileInfo: action.value
            }
        case 'CONNECTION_INFO':
            return {
                ...state,
                connected: action.value
            }
       
        default:
            return state;
    }
}

export default usersReducer;