const baseURL = 'http://192.168.110.240:8000';

function request({
  url,
  method = 'GET',
  data,
  header,
  config = {}
} = {}) {

  const token = uni.getStorageSync("user")?.token ?? ''
  const myHeader = {
    token,
    'content-type': "application/json",
    ...header
  }
  uni.showLoading({
    title: '加载中...'
  })
  return new Promise((resolve, reject) => {
    uni.request({
      url: baseURL + url,
      method,
      data,
      header: myHeader,
      ...config,
      success: res => {
        resolve(res)
      },
      fail: error => {
        console.log("请求错误", error);
        uni.showToast({
          title: error.errMsg,
          icon: "error"
        })
      },
      complete: () => {
        uni.hideLoading()
      }
    })
  })
}
export default request