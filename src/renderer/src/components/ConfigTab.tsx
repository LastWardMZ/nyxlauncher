import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { GeneralSettingsForm } from '@renderer/components/GeneralSettingsForm'
import { ServerPropertiesEditor } from '@renderer/components/ServerPropertiesEditor'
import type { ServerConfig } from '@shared/types'

export function ConfigTab({ server }: { server: ServerConfig }): JSX.Element {
  return (
    <Tabs defaultValue="general" className="flex h-full flex-col">
      <TabsList className="w-fit">
        <TabsTrigger value="general">General y lanzamiento</TabsTrigger>
        <TabsTrigger value="properties">{server.configFilePath}</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <GeneralSettingsForm server={server} />
      </TabsContent>
      <TabsContent value="properties" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ServerPropertiesEditor serverId={server.id} configFilePath={server.configFilePath} />
      </TabsContent>
    </Tabs>
  )
}
