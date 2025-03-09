"use client";

import { Button, Card, Flex, Text, TextField } from "@radix-ui/themes";
import { UploadIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import createUpload from "./actions/create-upload";
import { useRouter } from "next/navigation";

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type (image only)
    if (!selectedFile.type.startsWith("image/")) {
      setError("Please upload an image file");
      setFile(null);
      return;
    }

    // Validate file size (10MB max)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const result = await createUpload(formData);

      if (result.error) {
        setError(result.error);
      } else {
        // Reset form on success
        setFile(null);
        if (e.target instanceof HTMLFormElement) {
          e.target.reset();
        }

        if (result.data && result.data.uploadId) {
          router.push(`/uploads/${result.data.uploadId}`);
        }
      }
    } catch (err) {
      setError("Failed to upload file");
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card size="2" style={{ boxShadow: "0 4px 20px rgba(0, 120, 255, 0.1)" }}>
      <form onSubmit={handleSubmit}>
        <Flex direction="column" gap="3">
          <Text size="3" weight="bold">
            Upload a Book Cover
          </Text>

          <Flex
            direction="column"
            gap="2"
            p="4"
            style={{
              border: "1px dashed var(--blue-7)",
              borderRadius: "var(--radius-3)",
              backgroundColor: "rgba(224, 242, 254, 0.5)",
            }}
          >
            <Flex
              justify="center"
              align="center"
              direction="column"
              gap="2"
              py="6"
            >
              <UploadIcon width={24} height={24} color="var(--blue-10)" />
              <Text size="2">
                {file ? file.name : "Drag & drop or click to select a file"}
              </Text>
              <Text size="1" color="gray">
                Upload a book cover image to extract information
              </Text>

              <Button
                size="2"
                variant="soft"
                color="blue"
                style={{ position: "relative", overflow: "hidden" }}
              >
                Select File
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: "pointer",
                  }}
                />
              </Button>
            </Flex>
          </Flex>

          {error && (
            <Text color="red" size="2">
              {error}
            </Text>
          )}

          <Button type="submit" disabled={!file || isUploading} color="blue">
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </Flex>
      </form>
    </Card>
  );
}
