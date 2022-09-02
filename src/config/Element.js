import {
  Steps,
  Select,
  Option,
  Step,
  InputNumber,
  Loading,
  Notification,
  // MessageBox,
  Button,
  Pagination,
  Drawer,
  Dialog,
  Table,
  TableColumn,
  Popover,
  Tabs,
  TabPane
} from 'element-ui'
const element = {
  install: function(Vue) {
    Vue.use(Steps)
    Vue.use(Step)
    Vue.use(InputNumber)
    Vue.use(Loading)
    Vue.use(Button)
    Vue.use(Pagination)
    Vue.use(Drawer)
    Vue.use(Table)
    Vue.use(TableColumn)
    Vue.use(Popover)
    Vue.use(Dialog)
    Vue.use(Select)
    Vue.use(Option)
    Vue.use(Tabs)
    Vue.use(TabPane)
    // Vue.prototype.$message = Message
    Vue.prototype.$notify = Notification
    // Vue.prototype.$msgbox = MessageBox
    // Vue.prototype.$alert = MessageBox.alert
    // Vue.prototype.$confirm = MessageBox.confirm
    // Vue.prototype.$prompt = MessageBox.prompt
  },
}
export default element
