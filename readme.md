## audio 自定义音频播放器
#### 兼容
  |H5|微信小程序|支付宝小程序|抖音小程序|APP(vue)|APP(nvue)
  |---|---|---|---|---|---|
  |&check;|&check;|&cross;|&cross;|&cross;|&cross;|

#### 属性
  | 属性 | 类型 | 必填 | 默认值 | 功能/备注 |
  |---|---|---|---|---|---|
  | audio | String | required | | 音频地址 |
  | playIcon | String | | | 自定义音频播放按钮 |
  | pauseIcon | String | | | 自定义音频暂停按钮 |
  | title | String | |  | 音频标题 |
  | sliderColor | String | | #009EFF | 进度条颜色 |
  | backgroundColor | String | | #EFEFEF | 进度条背景颜色 |
  | activeSize | Number | | 12(单位px) | 进度条指示点大小 |
  | activeColor | String | | #009EFF | 进度条指示点颜色 |