
const istate = {
   
    packageInfo: {},
    vendorInfo:{}
}

const usersReducer = (state = istate, action) => {
    switch (action.type) {
       
        case 'PACKAGE_INFO':
            return {
                ...state,
                packageInfo: action.value
            }
        case 'VENDOR_INFO':
            return {
                ...state,
                vendorInfo: action.value
            }
        default:
            return state;
    }
}

export default usersReducer;