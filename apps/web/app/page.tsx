export const dynamic = 'force-dynamic';

import { Flex, Heading } from "@radix-ui/themes";
import Uploads from "./uploads/uploads";
import Image from "next/image";
export default function Home() {
  return (
    <div>
      <main>
        <Heading size="8" mt="6" mb="2">
          <Flex align="center" gap="2">
            <Image src="/book-finder-logo.svg" alt="BookFinder" width={32} height={32} />
            <Heading size="8">BookFinder</Heading>
          </Flex>
        </Heading>
        <Uploads />
      </main>
    </div>
  );
}
