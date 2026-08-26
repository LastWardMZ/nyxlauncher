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
      <TabsContent value="general" className="min-h-0 flex-1">
        <GeneralSettingsForm server={server} />
      </TabsContent>
      <TabsContent value="properties" className="min-h-0 flex-1">
        <ServerPropertiesEditor serverId={server.id} configFilePath={server.configFilePath} />
      </TabsContent>
    </Tabs>
  )
}
