import getUploads from "./actions/get-uploads";
import UploadGrid from "./upload-grid";
import UploadForm from "./upload-form";
import { Flex, Heading, Separator } from "@radix-ui/themes";

export default async function Uploads() {
  const uploads = await getUploads();

  return (
    <Flex direction="column" gap="6">
      <Separator size="4" />
      
      <UploadForm />
      
      <Heading size="5">Previous Uploads</Heading>
      <UploadGrid uploads={uploads} />
    </Flex>
  );
}
