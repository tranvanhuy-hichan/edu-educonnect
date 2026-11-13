import { Tabs } from "@/components/ui";
const tabs=[["/tai-khoan","Tài khoản"],["/tai-khoan/nhan-su","Nhân sự & BCH"],["/tai-khoan/bao-mat","Bảo mật"]] as [string,string][];
export function AccountTabs({current}:{current:string}) {return <Tabs items={tabs} current={current} />;}
