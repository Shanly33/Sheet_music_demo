import {
  defineStore
} from 'pinia'
import {
  ref
} from 'vue'

export const useUserStore = defineStore('user', () => {
  const user = ref({});
  const token = ref('');

  function setUser(data) {
    this.user = data.user
    this.token = data.token
  }

  function clearUserinfo() {
    uni.removeStorage({
      key: 'user',
      success() {
        console.log("清除成功");
      }
    })
  }
  return {
    user,
    token,
    setUser,
    clearUserinfo
  }
}, {
  persist: {
    storage: {
      getItem: uni.getStorageSync,
      setItem: uni.setStorageSync
    }
  },
})