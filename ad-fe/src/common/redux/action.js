
export const handleLoader = value => dispatch => dispatch({ type: 'GET_LOADER', value })
// -------admin---------//
export const profileInfoHandler = value => dispatch => dispatch({ type: 'PROFILE_INFO', value })
export const connectionHandler = value => dispatch => dispatch({ type: 'CONNECTION_INFO', value })


// ----------super admin-----------//
export const packageInfoHandler = value => dispatch => dispatch({ type: 'PACKAGE_INFO', value })
export const vendorInfoHandler = value => dispatch => dispatch({ type: 'VENDOR_INFO', value })