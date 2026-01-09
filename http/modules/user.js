import request from "../request";
export const login = (data) => {
  return request({
    url: '/api/v1/auth/login',
    method: 'post',
    data
  })
}