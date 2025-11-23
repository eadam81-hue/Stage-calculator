import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, ArrowLeft, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ComponentManager = () => {
  const navigate = useNavigate();
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [componentToDelete, setComponentToDelete] = useState(null);

  useEffect(() => {
    fetchComponents();
  }, []);

  const fetchComponents = async () => {
    try {
      const response = await axios.get(`${API}/components`);
      setComponents(response.data);
    } catch (error) {
      console.error("Error fetching components:", error);
      toast.error("Failed to load components");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error("Please upload an Excel file (.xlsx or .xls)");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API}/components/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast.success(`Successfully added ${response.data.components_added} components`);
      if (response.data.errors && response.data.errors.length > 0) {
        toast.warning(`${response.data.errors.length} rows had errors`);
      }
      fetchComponents();
      event.target.value = ''; // Reset file input
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error.response?.data?.detail || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (componentId) => {
    try {
      await axios.delete(`${API}/components/${componentId}`);
      toast.success("Component deleted successfully");
      fetchComponents();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete component");
    }
    setDeleteDialogOpen(false);
    setComponentToDelete(null);
  };

  const handleDeleteAll = async () => {
    try {
      await axios.delete(`${API}/components`);
      toast.success("All components deleted");
      fetchComponents();
    } catch (error) {
      console.error("Delete all error:", error);
      toast.error("Failed to delete components");
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4"
            data-testid="back-btn"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Calculator
          </Button>
          <h1 className="text-5xl font-bold gradient-text mb-2">Component Library</h1>
          <p className="text-slate-600 text-lg">Manage your stage components inventory</p>
        </div>

        {/* Upload Section */}
        <Card className="glass-card mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-cyan-600" />
              Upload Components
            </CardTitle>
            <CardDescription>
              Upload an Excel file with columns: Name, Quantity, Price, Weight
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={uploading}
                className="flex-1"
                data-testid="file-upload-input"
              />
              {uploading && <Loader2 className="h-5 w-5 animate-spin text-cyan-600" />}
            </div>
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900 font-medium mb-2">Excel File Format:</p>
              <div className="text-sm text-blue-800">
                <p>• Row 1: Headers (Name, Quantity, Price, Weight)</p>
                <p>• Row 2+: Your component data</p>
                <p className="mt-2 flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Example: Stage Deck | 50 | 125.00 | 45.5
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Components Table */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Available Components</CardTitle>
                <CardDescription>
                  {components.length} component(s) in inventory
                </CardDescription>
              </div>
              {components.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAll}
                  data-testid="delete-all-btn"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
              </div>
            ) : components.length === 0 ? (
              <div className="text-center py-12">
                <Upload className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 text-lg">No components yet</p>
                <p className="text-slate-400 text-sm">Upload an Excel file to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Price ($)</TableHead>
                      <TableHead className="text-right">Weight (kg)</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {components.map((component) => (
                      <TableRow key={component.id} data-testid={`component-row-${component.id}`}>
                        <TableCell className="font-medium">{component.name}</TableCell>
                        <TableCell className="text-right">{component.quantity}</TableCell>
                        <TableCell className="text-right">${component.price.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{component.weight.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setComponentToDelete(component);
                              setDeleteDialogOpen(true);
                            }}
                            data-testid={`delete-btn-${component.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Component</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{componentToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(componentToDelete?.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ComponentManager;